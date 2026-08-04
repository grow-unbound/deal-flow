-- Take metrics_refresh_state.source_watermark from V4 summaries instead of the
-- legacy metrics_tenant_*_snapshot tables.
--
-- app.metrics_refresh_tick's acknowledge stage read four v1/v2-era snapshot
-- tables to compute the watermark. Those tables have no writer left anywhere in
-- the database -- their refresh path was removed during the v1 retirement and
-- nothing replaced it. Measured on 2026-08-04:
--
--   metrics_tenant_commercial_snapshot.source_watermark = 2026-08-01 07:29
--   metrics_tenant_period_summary.source_watermark      = 2026-08-04 05:43
--
-- So the tick has been writing a watermark three days stale, sourced from a
-- table nothing maintains. This is a correctness fix as much as a decoupling.
--
-- Same per-domain shape as before, pointed at the tables V4 actually writes:
--   commercial -> metrics_tenant_period_summary
--   inventory  -> metrics_location_period_summary + metrics_warehouse_period_summary
--   buyer_app  -> metrics_campaign_period_summary + metrics_cohort_period_summary
--   setup      -> metrics_landing_kpi_snapshot (the only thing the setup domain writes)
--
-- After this, metrics_refresh_tick no longer references any legacy table, and
-- the four metrics_tenant_*_snapshot tables become genuinely droppable.
--
-- The work_mem setting applied by 20260804033955 is an ALTER FUNCTION ... SET,
-- which CREATE OR REPLACE preserves -- proconfig survives a body replacement.
-- Re-asserted at the end of this migration regardless, so it cannot be lost.
CREATE OR REPLACE FUNCTION app.metrics_refresh_tick(
  p_stage text,
  p_owner_token uuid,
  p_fencing_epoch bigint DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_domain text DEFAULT NULL
)
RETURNS TABLE (
  status text,
  owner_token uuid,
  fencing_epoch bigint,
  tenant_id uuid,
  domain text,
  dirty_sources integer,
  refresh_keys integer,
  statement_groups integer,
  has_more boolean,
  lease_until timestamptz,
  error_text text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
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
        -- Watermark now comes from the V4 summaries this tick actually writes,
        -- not from the four legacy metrics_tenant_*_snapshot tables.
        --
        -- Those tables have no writer left: on 2026-08-04 the commercial one
        -- held a watermark of 2026-08-01 07:29 while the V4 tenant summary held
        -- 2026-08-04 05:43. So this column has been recording a watermark three
        -- days behind reality -- reading a table nothing maintains. Same shape
        -- per domain as before, just pointed at the tables V4 owns.
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
        last_error = CASE WHEN w.dirty_version = w.claimed_version THEN 'metrics_compute_failed' ELSE NULL END,
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
        last_error = 'metrics_compute_failed', updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND domain = p_domain;
    UPDATE app.metrics_execution_history h
    SET status = CASE WHEN v_dead > 0 THEN 'dead_letter' ELSE 'failed' END,
        dead_letter_count = v_dead, error_text = 'metrics_compute_failed',
        finished_at = clock_timestamp(),
        duration_ms = ROUND(EXTRACT(epoch FROM (clock_timestamp() - h.started_at)) * 1000)::integer
    WHERE h.id = (
      SELECT id FROM app.metrics_execution_history
      WHERE owner_token = p_owner_token AND status = 'started'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE
    );

    RETURN QUERY SELECT CASE WHEN v_dead > 0 THEN 'dead_letter' ELSE 'retry' END,
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
      v_sources, 0, 0, true, v_lease_until, 'metrics_compute_failed'::text;
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
$$;

ALTER FUNCTION app.metrics_refresh_tick(text, uuid, bigint, uuid, text)
  SET work_mem = '32MB';
