-- Metrics V4: chunk wide dirty-work ranges + auto-requeue dead-letters.
--
-- Root cause (2026-08-09 Wine Yard receivables/overdue audit): a sync job
-- whose since_date is NULL (initial/backfill jobs -- see
-- app.metrics_mark_sync_completion) marks a full 89-day dirty range in ONE
-- app.metrics_dirty_work row. app._metrics_v4_refresh_claimed_periods only
-- guards spans over 99 days; an 89-day span passes that guard and then
-- deterministically blows the 3s statement_timeout on every compute
-- attempt for a high-volume tenant, exhausts 3 retries, and lands in
-- state='dead_letter' -- permanently, since nothing ever revives dead
-- letters. That is confirmed as the direct cause of Wine Yard's outstanding
-- dues / overdue receivables undercount (raw invoices table vs
-- metrics_tenant_now_summary): real invoice/payment status changes inside
-- that 89-day span never made it into the snapshot.
--
-- Two closes:
-- 1. app.metrics_mark_dirty now splits any dirty_from/dirty_to span wider
--    than 7 days into independently-claimable <=7-day chunks at insert
--    time, with a deterministic per-chunk source_id so re-marking the same
--    source/range is idempotent (no duplicate chunk rows on retrigger).
--    This covers every caller (sync completion, age_out, reconciliation,
--    manual repair) generically, not just the one that caused this
--    incident.
-- 2. app.metrics_requeue_dead_letters() finds dead-letter rows and revives
--    them: range rows get re-marked through the (now chunking)
--    metrics_mark_dirty and the oversized original is retired; single-
--    source rows (no date range -- e.g. a specific estimate_item or
--    buyer_app_activity row) are reset to pending in place. Wired into the
--    existing daily reconciliation sweep so this self-heals within 24h
--    without manual intervention, and run once immediately below to clear
--    Wine Yard's current backlog (2 commercial sync_job rows, 11 buyer_app
--    rows).
--
-- Separately: app.metrics_refresh_tick's 'fail' stage previously hardcoded
-- last_error = 'metrics_compute_failed' regardless of what actually broke
-- (statement timeout vs a real data bug). That is why the buyer_app burst
-- of 11 dead-letters on 2026-08-06 has no diagnosable cause -- the real
-- SQLSTATE/SQLERRM was thrown away before it ever reached the dirty_work
-- row. p_error_text now threads the real error through from the calling
-- edge function (supabase/functions/metrics-refresh-tick/index.ts, updated
-- alongside this migration) so future dead-letters are diagnosable.

CREATE OR REPLACE FUNCTION app.metrics_mark_dirty(
  p_tenant_id uuid,
  p_domain text,
  p_source_type text,
  p_source_id uuid,
  p_old_buyer_id uuid DEFAULT NULL,
  p_new_buyer_id uuid DEFAULT NULL,
  p_old_tenant_product_id uuid DEFAULT NULL,
  p_new_tenant_product_id uuid DEFAULT NULL,
  p_old_location_id uuid DEFAULT NULL,
  p_new_location_id uuid DEFAULT NULL,
  p_old_day date DEFAULT NULL,
  p_new_day date DEFAULT NULL,
  p_dirty_from date DEFAULT NULL,
  p_dirty_to date DEFAULT NULL
)
RETURNS TABLE (work_id uuid, dirty_version bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_chunk_days constant integer := 7;
  v_chunk_from date;
  v_chunk_to date;
  v_chunk_source_id uuid;
  v_chunk_idx integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'metrics_dirty_identity_required' USING ERRCODE = '22023';
  END IF;
  IF NOT app.metrics_source_type_valid(p_domain, p_source_type) THEN
    RAISE EXCEPTION 'metrics_dirty_source_invalid:%/%', p_domain, p_source_type USING ERRCODE = '22023';
  END IF;
  IF p_dirty_from IS NOT NULL AND p_dirty_to IS NOT NULL AND p_dirty_from > p_dirty_to THEN
    RAISE EXCEPTION 'metrics_dirty_range_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.tenants t WHERE t.id = p_tenant_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'metrics_tenant_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES (p_old_buyer_id), (p_new_buyer_id)) AS ids(id)
    WHERE ids.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.buyers b
        WHERE b.id = ids.id AND b.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'metrics_buyer_tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES (p_old_tenant_product_id), (p_new_tenant_product_id)) AS ids(id)
    WHERE ids.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.tenant_products tp
        WHERE tp.id = ids.id AND tp.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'metrics_product_tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES (p_old_location_id), (p_new_location_id)) AS ids(id)
    WHERE ids.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.locations l
        WHERE l.id = ids.id AND l.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'metrics_location_tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Wide ranges (backfill/reconciliation sources only -- these never carry
  -- buyer/product/location ids, enforced by metrics_source_type_valid) are
  -- split into <= v_chunk_days windows so each chunk's compute fits inside
  -- the per-tick statement_timeout/wall_budget instead of guaranteeing a
  -- timeout -> retry -> dead_letter cycle that makes zero progress.
  IF p_dirty_from IS NOT NULL AND p_dirty_to IS NOT NULL AND (p_dirty_to - p_dirty_from) > v_chunk_days THEN
    v_chunk_from := p_dirty_from;
    WHILE v_chunk_from <= p_dirty_to LOOP
      v_chunk_to := LEAST(v_chunk_from + (v_chunk_days - 1), p_dirty_to);
      -- Deterministic per-chunk id: the same source + same chunk window
      -- always maps to the same row, so re-marking (retries, a repeated
      -- trigger fire, the requeue function below) is idempotent instead of
      -- spawning duplicate chunk rows.
      v_chunk_source_id := (md5(p_source_id::text || ':chunk:' || v_chunk_idx::text))::uuid;

      RETURN QUERY
      INSERT INTO app.metrics_dirty_work (
        tenant_id, domain, source_type, source_id,
        old_buyer_id, new_buyer_id,
        old_tenant_product_id, new_tenant_product_id,
        old_location_id, new_location_id,
        old_day, new_day, dirty_from, dirty_to,
        dirty_version, state, attempts, next_attempt_at,
        lease_owner, lease_until, claimed_version, last_error,
        cursor_kind, cursor_day, cursor_id, cursor_aux_id, updated_at, completed_at
      ) VALUES (
        p_tenant_id, p_domain, p_source_type, v_chunk_source_id,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        v_chunk_from, v_chunk_to,
        1, 'pending', 0, clock_timestamp(),
        NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, clock_timestamp(), NULL
      )
      ON CONFLICT (tenant_id, domain, source_type, source_id)
        WHERE state = ANY (ARRAY['pending', 'claimed', 'retry'])
      DO UPDATE SET
        dirty_version = app.metrics_dirty_work.dirty_version + 1,
        claimed_version = NULL,
        state = 'pending',
        attempts = 0,
        next_attempt_at = clock_timestamp(),
        lease_owner = NULL,
        lease_until = NULL,
        last_error = NULL,
        cursor_kind = NULL,
        cursor_day = NULL,
        cursor_id = NULL, cursor_aux_id = NULL,
        updated_at = clock_timestamp(),
        completed_at = NULL
      RETURNING app.metrics_dirty_work.id, app.metrics_dirty_work.dirty_version;

      v_chunk_from := v_chunk_to + 1;
      v_chunk_idx := v_chunk_idx + 1;
    END LOOP;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO app.metrics_dirty_work (
    tenant_id, domain, source_type, source_id,
    old_buyer_id, new_buyer_id,
    old_tenant_product_id, new_tenant_product_id,
    old_location_id, new_location_id,
    old_day, new_day, dirty_from, dirty_to,
    dirty_version, state, attempts, next_attempt_at,
    lease_owner, lease_until, claimed_version, last_error,
    cursor_kind, cursor_day, cursor_id, cursor_aux_id, updated_at, completed_at
  ) VALUES (
    p_tenant_id, p_domain, p_source_type, p_source_id,
    p_old_buyer_id, p_new_buyer_id,
    p_old_tenant_product_id, p_new_tenant_product_id,
    p_old_location_id, p_new_location_id,
    p_old_day, p_new_day, p_dirty_from, p_dirty_to,
    1, 'pending', 0, clock_timestamp(),
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, clock_timestamp(), NULL
  )
  ON CONFLICT (tenant_id, domain, source_type, source_id)
    WHERE state = ANY (ARRAY['pending', 'claimed', 'retry'])
  DO UPDATE SET
    old_buyer_id = COALESCE(app.metrics_dirty_work.old_buyer_id, EXCLUDED.old_buyer_id),
    new_buyer_id = COALESCE(EXCLUDED.new_buyer_id, app.metrics_dirty_work.new_buyer_id),
    old_tenant_product_id = COALESCE(app.metrics_dirty_work.old_tenant_product_id, EXCLUDED.old_tenant_product_id),
    new_tenant_product_id = COALESCE(EXCLUDED.new_tenant_product_id, app.metrics_dirty_work.new_tenant_product_id),
    old_location_id = COALESCE(app.metrics_dirty_work.old_location_id, EXCLUDED.old_location_id),
    new_location_id = COALESCE(EXCLUDED.new_location_id, app.metrics_dirty_work.new_location_id),
    old_day = COALESCE(app.metrics_dirty_work.old_day, EXCLUDED.old_day),
    new_day = COALESCE(EXCLUDED.new_day, app.metrics_dirty_work.new_day),
    dirty_from = CASE
      WHEN app.metrics_dirty_work.dirty_from IS NULL THEN EXCLUDED.dirty_from
      WHEN EXCLUDED.dirty_from IS NULL THEN app.metrics_dirty_work.dirty_from
      ELSE LEAST(app.metrics_dirty_work.dirty_from, EXCLUDED.dirty_from)
    END,
    dirty_to = CASE
      WHEN app.metrics_dirty_work.dirty_to IS NULL THEN EXCLUDED.dirty_to
      WHEN EXCLUDED.dirty_to IS NULL THEN app.metrics_dirty_work.dirty_to
      ELSE GREATEST(app.metrics_dirty_work.dirty_to, EXCLUDED.dirty_to)
    END,
    dirty_version = app.metrics_dirty_work.dirty_version + 1,
    claimed_version = NULL,
    state = 'pending',
    attempts = 0,
    next_attempt_at = clock_timestamp(),
    lease_owner = NULL,
    lease_until = NULL,
    last_error = NULL,
    cursor_kind = NULL,
    cursor_day = NULL,
    cursor_id = NULL, cursor_aux_id = NULL,
    updated_at = clock_timestamp(),
    completed_at = NULL
  RETURNING app.metrics_dirty_work.id, app.metrics_dirty_work.dirty_version;
END;
$$;

-- Auto-requeue: range dead-letters get re-marked (and thus re-chunked)
-- through metrics_mark_dirty above; single-source dead-letters are reset
-- to pending in place. p_min_age keeps this from racing a row that just
-- landed in dead_letter a moment ago.
CREATE OR REPLACE FUNCTION app.metrics_requeue_dead_letters(
  p_min_age interval DEFAULT interval '15 minutes'
)
RETURNS TABLE (requeued_ranges integer, requeued_singles integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_row record;
  v_ranges integer := 0;
  v_singles integer := 0;
BEGIN
  FOR v_row IN
    SELECT *
    FROM app.metrics_dirty_work
    WHERE state = 'dead_letter'
      AND updated_at <= clock_timestamp() - p_min_age
  LOOP
    IF v_row.dirty_from IS NOT NULL OR v_row.dirty_to IS NOT NULL THEN
      PERFORM app.metrics_mark_dirty(
        v_row.tenant_id, v_row.domain, v_row.source_type, v_row.source_id,
        p_dirty_from => v_row.dirty_from, p_dirty_to => v_row.dirty_to
      );
      UPDATE app.metrics_dirty_work
      SET state = 'completed',
          completed_at = clock_timestamp(),
          last_error = 'superseded_by_chunked_requeue',
          updated_at = clock_timestamp()
      WHERE id = v_row.id;
      v_ranges := v_ranges + 1;
    ELSE
      -- No source-existence check here: source_type varies per domain
      -- (estimate_item, buyer_app_activity, etc.) with no single FK to
      -- verify generically. If the source is genuinely gone the compute
      -- step is expected to no-op safely; if it fails again the fail-stage
      -- fix below now records the real reason instead of a generic marker.
      UPDATE app.metrics_dirty_work
      SET state = 'pending',
          attempts = 0,
          next_attempt_at = clock_timestamp(),
          lease_owner = NULL,
          lease_until = NULL,
          claimed_version = NULL,
          last_error = NULL,
          updated_at = clock_timestamp()
      WHERE id = v_row.id;
      v_singles := v_singles + 1;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_ranges, v_singles;
END;
$$;

ALTER FUNCTION app.metrics_requeue_dead_letters(interval) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.metrics_requeue_dead_letters(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.metrics_requeue_dead_letters(interval) TO service_role;

-- Wire into the existing daily reconciliation sweep (05:30 IST fallback
-- cron) so dead-letters self-heal within 24h without manual intervention.
CREATE OR REPLACE FUNCTION app.metrics_v2_run_daily_reconciliation_sweep() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_tenant record;
BEGIN
  PERFORM app.metrics_requeue_dead_letters();
  FOR v_tenant IN SELECT id FROM app.tenants WHERE deleted_at IS NULL LOOP
    PERFORM app.metrics_mark_daily_reconciliation(v_tenant.id);
  END LOOP;
END;
$$;

ALTER FUNCTION app.metrics_v2_run_daily_reconciliation_sweep() OWNER TO postgres;

-- metrics_refresh_tick: thread the real error text through the 'fail'
-- stage instead of hardcoding 'metrics_compute_failed'. p_error_text is
-- appended with a default so this stays backward compatible with any
-- caller that doesn't pass it.
CREATE OR REPLACE FUNCTION app.metrics_refresh_tick(
  p_stage text,
  p_owner_token uuid,
  p_fencing_epoch bigint DEFAULT NULL::bigint,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_domain text DEFAULT NULL::text,
  p_error_text text DEFAULT NULL::text
)
 RETURNS TABLE(status text, owner_token uuid, fencing_epoch bigint, tenant_id uuid, domain text, dirty_sources integer, refresh_keys integer, statement_groups integer, has_more boolean, lease_until timestamp with time zone, error_text text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app', 'pg_temp'
 SET work_mem TO '32MB'
AS $function$
#variable_conflict use_column
DECLARE
  v_started timestamptz := clock_timestamp();
  v_rows integer := 0;
  v_groups integer := 0;
  v_sources integer := 0;
  v_keys integer := 0;
  v_has_more boolean := false;
  v_watermark timestamptz;
  v_lease_until timestamptz;
  v_dead integer := 0;
  v_lock_timeout_ms integer := 100;
  v_statement_timeout_ms integer := 3000;
  v_wall_budget_ms integer := 5000;
  v_statement_group_budget integer := 25;
  v_error_text text;
BEGIN
  IF p_stage = 'claim' THEN
    RETURN QUERY SELECT * FROM app.metrics_claim_dirty_work(p_owner_token);
    RETURN;
  END IF;

  IF p_stage <> ALL (ARRAY['compute', 'acknowledge', 'fail', 'release']) THEN
    RAISE EXCEPTION 'metrics_tick_stage_invalid:%', p_stage USING ERRCODE = '22023';
  END IF;
  IF p_fencing_epoch IS NULL OR p_tenant_id IS NULL OR p_domain IS NULL THEN
    RAISE EXCEPTION 'metrics_claim_identity_required' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(MIN(c.lock_timeout_ms), 100),
    COALESCE(MIN(c.statement_timeout_ms), 3000),
    COALESCE(MIN(c.tick_wall_budget_ms), 5000),
    COALESCE(MIN(c.max_statement_groups_per_tick), 25)
  INTO v_lock_timeout_ms, v_statement_timeout_ms, v_wall_budget_ms, v_statement_group_budget
  FROM app.metrics_runtime_control c
  WHERE c.control_scope = 'global'
     OR (
       c.control_scope = 'tenant'
       AND c.tenant_id = p_tenant_id
       AND (c.domain IS NULL OR c.domain = p_domain)
     );

  PERFORM set_config('lock_timeout', v_lock_timeout_ms::text || 'ms', true);
  PERFORM set_config('statement_timeout', v_statement_timeout_ms::text || 'ms', true);

  IF p_stage = 'compute' THEN
    v_lease_until := app._metrics_assert_refresh_fence(
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain
    );
    UPDATE app.metrics_dirty_work w
    SET cursor_kind = CASE p_domain
          WHEN 'commercial' THEN 'buyer'
          WHEN 'inventory' THEN 'product'
          ELSE 'done'
        END,
        cursor_id = NULL, cursor_aux_id = NULL, cursor_day = NULL, updated_at = clock_timestamp()
    WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
      AND w.claimed_version = w.dirty_version
      AND w.dirty_from IS NOT NULL AND w.cursor_kind IS NULL;
    PERFORM set_config('app.metrics_cursor_stage', COALESCE((
      SELECT w.cursor_kind FROM app.metrics_dirty_work w
      WHERE w.lease_owner = p_owner_token AND w.state = 'claimed' AND w.dirty_from IS NOT NULL
      ORDER BY w.created_at, w.id LIMIT 1
    ), ''), true);
    SELECT COUNT(*)::integer,
      COALESCE(SUM(
        1 + (old_buyer_id IS NOT NULL)::integer + (new_buyer_id IS NOT NULL)::integer
          + (old_tenant_product_id IS NOT NULL)::integer + (new_tenant_product_id IS NOT NULL)::integer
          + (old_location_id IS NOT NULL)::integer + (new_location_id IS NOT NULL)::integer
          + (old_day IS NOT NULL)::integer + (new_day IS NOT NULL)::integer
      ), 0)::integer
    INTO v_sources, v_keys
    FROM app.metrics_dirty_work
    WHERE lease_owner = p_owner_token AND state = 'claimed' AND claimed_version IS NOT NULL;

    IF p_domain = 'commercial' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_commercial(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSIF p_domain = 'inventory' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_inventory(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSIF p_domain = 'buyer_app' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_buyer_app(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSIF p_domain = 'setup' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_setup(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSE
      RAISE EXCEPTION 'metrics_domain_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_groups > v_statement_group_budget THEN
      RAISE EXCEPTION 'metrics_statement_group_budget_exceeded' USING ERRCODE = '54000';
    END IF;
    IF EXTRACT(epoch FROM (clock_timestamp() - v_started)) * 1000 > v_wall_budget_ms THEN
      RAISE EXCEPTION 'metrics_tick_wall_budget_exceeded' USING ERRCODE = '57014';
    END IF;

    UPDATE app.metrics_execution_history h
    SET statement_groups_executed = v_groups,
        snapshot_rows_updated = v_rows,
        compute_completed_at = clock_timestamp()
    WHERE h.id = (
      SELECT id FROM app.metrics_execution_history
      WHERE owner_token = p_owner_token AND status = 'started'
      ORDER BY started_at DESC LIMIT 1
      FOR UPDATE
    );

    RETURN QUERY SELECT 'computed', p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
      v_sources, v_keys, v_groups, true, v_lease_until, NULL::text;
    RETURN;
  END IF;

  IF p_stage = 'acknowledge' THEN
    v_lease_until := app._metrics_assert_refresh_fence(
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain
    );

    IF NOT EXISTS (
      SELECT 1
      FROM app.metrics_execution_history h
      WHERE h.owner_token = p_owner_token
        AND h.tenant_id = p_tenant_id
        AND h.domain = p_domain
        AND h.fencing_epoch = p_fencing_epoch
        AND h.status = 'started'
        AND h.compute_completed_at IS NOT NULL
      ORDER BY h.started_at DESC
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'metrics_compute_required_before_acknowledge' USING ERRCODE = '55000';
    END IF;

    WITH acknowledged AS (
      UPDATE app.metrics_dirty_work w
      SET
        state = CASE
          WHEN w.dirty_version <> w.claimed_version THEN 'pending'
          WHEN w.dirty_from IS NOT NULL AND w.cursor_kind IS DISTINCT FROM 'done' THEN 'pending'
          ELSE 'completed'
        END,
        cursor_kind = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_kind END,
        cursor_id = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_id END,
        cursor_aux_id = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_aux_id END,
        cursor_day = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_day END,
        attempts = CASE WHEN w.dirty_version <> w.claimed_version THEN 0 ELSE w.attempts END,
        next_attempt_at = clock_timestamp(),
        lease_owner = NULL,
        lease_until = NULL,
        claimed_version = NULL,
        last_error = NULL,
        completed_at = CASE
          WHEN w.dirty_version = w.claimed_version
            AND (w.dirty_from IS NULL OR w.cursor_kind = 'done')
          THEN clock_timestamp() ELSE NULL END,
        updated_at = clock_timestamp()
      WHERE w.lease_owner = p_owner_token
        AND w.tenant_id = p_tenant_id
        AND w.domain = p_domain
        AND w.state = 'claimed'
      RETURNING state, dirty_version
    )
    SELECT COUNT(*)::integer, COALESCE(bool_or(state <> 'completed'), false)
    INTO v_sources, v_has_more
    FROM acknowledged;

    SELECT v_has_more OR EXISTS (
      SELECT 1 FROM app.metrics_dirty_work pending
      WHERE pending.tenant_id = p_tenant_id
        AND pending.domain = p_domain
        AND pending.state = ANY (ARRAY['pending', 'retry', 'claimed'])
    ) INTO v_has_more;

    UPDATE app.metrics_refresh_state s
    SET last_completed_version = GREATEST(s.last_completed_version, COALESCE((
          SELECT MAX(w.dirty_version) FROM app.metrics_dirty_work w
          WHERE w.tenant_id = p_tenant_id AND w.domain = p_domain AND w.state = 'completed'
        ), s.last_completed_version)),
        source_watermark = COALESCE((
          SELECT MAX(x.source_watermark) FROM (
            SELECT MAX(t.source_watermark) AS source_watermark FROM app.metrics_tenant_period_summary t
              WHERE t.tenant_id = p_tenant_id AND t.deleted_at IS NULL AND p_domain = 'commercial'
            UNION ALL SELECT MAX(l.source_watermark) FROM app.metrics_location_period_summary l
              WHERE l.tenant_id = p_tenant_id AND l.deleted_at IS NULL AND p_domain = 'inventory'
            UNION ALL SELECT MAX(w2.source_watermark) FROM app.metrics_warehouse_period_summary w2
              WHERE w2.tenant_id = p_tenant_id AND w2.deleted_at IS NULL AND p_domain = 'inventory'
            UNION ALL SELECT MAX(cp.source_watermark) FROM app.metrics_campaign_period_summary cp
              WHERE cp.tenant_id = p_tenant_id AND cp.deleted_at IS NULL AND p_domain = 'buyer_app'
            UNION ALL SELECT MAX(co.source_watermark) FROM app.metrics_cohort_period_summary co
              WHERE co.tenant_id = p_tenant_id AND co.deleted_at IS NULL AND p_domain = 'buyer_app'
            UNION ALL SELECT MAX(lk.source_watermark) FROM app.metrics_landing_kpi_snapshot lk
              WHERE lk.tenant_id = p_tenant_id AND lk.deleted_at IS NULL AND p_domain = 'setup'
          ) x
        ), s.source_watermark),
        last_successful_computation_at = clock_timestamp(),
        last_duration_ms = ROUND(EXTRACT(epoch FROM (clock_timestamp() - v_started)) * 1000)::integer,
        freshness_state = CASE WHEN v_has_more THEN 'stale' ELSE 'fresh' END,
        stale_after = CASE WHEN v_has_more THEN clock_timestamp() ELSE clock_timestamp() + interval '15 minutes' END,
        last_error = NULL,
        updated_at = clock_timestamp()
    WHERE s.tenant_id = p_tenant_id AND s.domain = p_domain;

    UPDATE app.metrics_execution_history h
    SET status = 'success', finished_at = clock_timestamp(),
        duration_ms = ROUND(EXTRACT(epoch FROM (clock_timestamp() - h.started_at)) * 1000)::integer
    WHERE h.id = (
      SELECT id FROM app.metrics_execution_history
      WHERE owner_token = p_owner_token AND status = 'started'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE
    );

    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'tenant_domain' AND tenant_id = p_tenant_id AND domain = p_domain
      AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;
    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'global' AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;

    RETURN QUERY SELECT 'acknowledged', p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
      v_sources, 0, 0, v_has_more, v_lease_until, NULL::text;
    RETURN;
  END IF;

  IF p_stage = 'fail' THEN
    v_lease_until := app._metrics_assert_refresh_fence(
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain
    );
    v_error_text := COALESCE(p_error_text, 'metrics_compute_failed');

    -- A failure is version-scoped. A newer dirty version is immediately reset
    -- to pending and never inherits an older version's attempts/backoff.
    WITH failed AS (
      UPDATE app.metrics_dirty_work w
      SET attempts = CASE WHEN w.dirty_version = w.claimed_version THEN w.attempts + 1 ELSE 0 END,
        state = CASE
          WHEN w.dirty_version <> w.claimed_version THEN 'pending'
          WHEN w.attempts + 1 >= 3 THEN 'dead_letter'
          ELSE 'retry'
        END,
        next_attempt_at = CASE
          WHEN w.dirty_version <> w.claimed_version THEN clock_timestamp()
          ELSE clock_timestamp()
            + make_interval(secs => LEAST(300, (2 ^ LEAST(w.attempts + 1, 8))::integer))
            + make_interval(secs => floor(random() * 3)::integer)
        END,
        lease_owner = NULL, lease_until = NULL, claimed_version = NULL,
        last_error = CASE WHEN w.dirty_version = w.claimed_version THEN v_error_text ELSE NULL END,
        updated_at = clock_timestamp()
      WHERE w.lease_owner = p_owner_token AND w.tenant_id = p_tenant_id
        AND w.domain = p_domain AND w.state = 'claimed'
      RETURNING state
    )
    SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE state = 'dead_letter')::integer
    INTO v_sources, v_dead FROM failed;

    IF v_sources = 0 THEN
      RAISE EXCEPTION 'metrics_no_claimed_work_to_fail' USING ERRCODE = '55000';
    END IF;

    UPDATE app.metrics_refresh_state
    SET freshness_state = CASE WHEN v_dead > 0 THEN 'error' ELSE 'stale' END,
        last_error = v_error_text, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND domain = p_domain;
    UPDATE app.metrics_execution_history h
    SET status = CASE WHEN v_dead > 0 THEN 'dead_letter' ELSE 'failed' END,
        dead_letter_count = v_dead, error_text = v_error_text,
        finished_at = clock_timestamp(),
        duration_ms = ROUND(EXTRACT(epoch FROM (clock_timestamp() - h.started_at)) * 1000)::integer
    WHERE h.id = (
      SELECT id FROM app.metrics_execution_history
      WHERE owner_token = p_owner_token AND status = 'started'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE
    );

    RETURN QUERY SELECT CASE WHEN v_dead > 0 THEN 'dead_letter' ELSE 'retry' END,
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
      v_sources, 0, 0, true, v_lease_until, v_error_text;
    RETURN;
  END IF;

  -- release is compare-and-release only; it never acknowledges dirty work.
  UPDATE app.metrics_refresh_leases
  SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
  WHERE lease_scope = 'tenant_domain' AND tenant_id = p_tenant_id AND domain = p_domain
    AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;
  UPDATE app.metrics_refresh_leases
  SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
  WHERE lease_scope = 'global' AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;
  RETURN QUERY SELECT 'released', p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
    0, 0, 0, true, NULL::timestamptz, NULL::text;
END;
$function$;

-- One-time immediate backfill: clear Wine Yard's (and any other tenant's)
-- current dead-letter backlog now rather than waiting for tomorrow's sweep.
SELECT app.metrics_requeue_dead_letters(interval '0 seconds');
