-- Phase 4 of the yukti-prod DB recovery (see specs/db-perf-recovery-2026-09-20.md).
-- Metrics refresh: delta-only writes, committed progress, no poison loops, no duplicate windows.
--
-- Measured on prod (rolled-back canaries, idle box, 2026-09-20):
--   * one commercial compute of a 2-day window = 9-13 s, 350-570 KB WAL, ~1,000 summary-row updates;
--     running the SAME window again immediately rewrote the SAME ~1,000 rows (100% no-op writes);
--   * 214 pending Wine Yard `commercial` rows since 2026-09-04 are 7-day `sync_job` windows over
--     only ~4 distinct date ranges (metrics_mark_sync_completion marks a 90-day trailing range per
--     sync job & phase, chunked into <=7-day windows with a per-job chunk id, so identical windows
--     never coalesce); each compute exceeds the 12-15 s wall budget, is rolled back with its
--     bookkeeping, and retries forever.
--
-- 1. metrics_mark_dirty: pure date-range rows get a WINDOW-derived source id -> identical windows
--    coalesce into one row instead of one per sync job.
-- 2. metrics_release_expired_leases: an expired lease now burns an attempt (dead_letter at 3) instead
--    of resetting the row to a fresh pending forever.
-- 3. metrics_requeue_dead_letters: at most 3 requeues (metrics_dirty_work.requeue_count).
-- 4. The 14 trg_metrics_v2_capture_* triggers: split into INSERT/DELETE + UPDATE OF <same cols> WHEN
--    (OLD.c IS DISTINCT FROM NEW.c ...) so unchanged-value upserts (sync) enqueue nothing.
-- 5. app.metrics_suppress_noop_update(): BEFORE UPDATE on every metrics summary/snapshot table skips
--    an update whose business columns are unchanged (bookkeeping columns incl. the per-upsert random
--    generation_id are ignored) -- the "identical replay must not rewrite" invariant of the original
--    metrics design, which the v4 upserts had lost.
-- 6. app.metrics_refresh_tick_run(): procedure, kill switch + lease recovery + idle fast-exit, then
--    per group: claim -> COMMIT, compute+acknowledge (own transaction), on failure the fail/release
--    stages are COMMITTED (bookkeeping survives), several groups per run inside a wall budget.
-- 7. Cron: job `metrics-refresh-tick` (INACTIVE) runs the procedure; the legacy-named
--    `metrics-v2-refresh-tick` job is removed when inactive (repointed when active).
-- 8. Data hygiene: coalesce duplicate pending range rows, close abandoned `started` history rows.
-- 9. Drop the redundant metrics_dirty_work_pending_claim_idx (13 scans in 3 weeks; makes every
--    state update non-HOT); allow tick_wall_budget_ms up to 60000 (data value is set in phase 8).
--
-- Idempotent. Does not enable any job.

-- ---------------------------------------------------------------------------------------------
-- schema bits
-- ---------------------------------------------------------------------------------------------
ALTER TABLE app.metrics_dirty_work
  ADD COLUMN IF NOT EXISTS requeue_count integer NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS app.metrics_dirty_work_pending_claim_idx;

DO $wall$
BEGIN
  ALTER TABLE app.metrics_runtime_control DROP CONSTRAINT IF EXISTS metrics_runtime_control_budget_check;
  ALTER TABLE app.metrics_runtime_control ADD CONSTRAINT metrics_runtime_control_budget_check CHECK (
    max_dirty_sources_per_tick >= 1 AND max_dirty_sources_per_tick <= 100
    AND max_refresh_keys_per_tick >= 1 AND max_refresh_keys_per_tick <= 500
    AND max_statement_groups_per_tick >= 1 AND max_statement_groups_per_tick <= 25
    AND lock_timeout_ms >= 1 AND lock_timeout_ms <= 100
    AND statement_timeout_ms >= 1 AND statement_timeout_ms <= 3000
    AND tick_wall_budget_ms >= 1 AND tick_wall_budget_ms <= 60000
    AND lease_ttl_seconds >= 5 AND lease_ttl_seconds <= 60
  );
END
$wall$;

-- ---------------------------------------------------------------------------------------------
-- 1-3. function patches (assert-exactly-once, idempotent)
-- ---------------------------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def text;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- 1. window-derived source id for pure date-range rows
      ('app.metrics_mark_dirty(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,date,date,date)'::regprocedure,
       E'  IF NOT app.metrics_source_type_valid(p_domain, p_source_type) THEN',
       E'  -- Pure date-range rows (no buyer/product/location ids): identity = the window, so identical\n  -- windows from different sync jobs coalesce instead of piling up one row per job.\n  IF p_dirty_from IS NOT NULL AND p_dirty_to IS NOT NULL\n     AND p_old_buyer_id IS NULL AND p_new_buyer_id IS NULL\n     AND p_old_tenant_product_id IS NULL AND p_new_tenant_product_id IS NULL\n     AND p_old_location_id IS NULL AND p_new_location_id IS NULL THEN\n    p_source_id := (md5(p_tenant_id::text || '':'' || p_domain || '':'' || p_source_type || '':window:''\n                        || p_dirty_from::text || '':'' || p_dirty_to::text))::uuid;\n  END IF;\n  IF NOT app.metrics_source_type_valid(p_domain, p_source_type) THEN'),
      -- 2. expired leases burn an attempt
      ('app.metrics_release_expired_leases(integer)'::regprocedure,
       E'  SET state = ''pending'', lease_owner = NULL, lease_until = NULL,\n      claimed_version = NULL, next_attempt_at = clock_timestamp(), updated_at = clock_timestamp()\n  FROM expired e',
       E'  SET state = CASE WHEN mdw.dirty_version IS DISTINCT FROM mdw.claimed_version THEN ''pending''\n                   WHEN mdw.attempts + 1 >= 3 THEN ''dead_letter'' ELSE ''pending'' END,\n      attempts = CASE WHEN mdw.dirty_version IS DISTINCT FROM mdw.claimed_version THEN 0 ELSE mdw.attempts + 1 END,\n      last_error = ''lease_expired'',\n      lease_owner = NULL, lease_until = NULL, claimed_version = NULL,\n      next_attempt_at = clock_timestamp() + LEAST(interval ''5 minutes'', interval ''15 seconds'' * power(2, mdw.attempts)),\n      updated_at = clock_timestamp()\n  FROM expired e'),
      -- 3. requeue cap
      ('app.metrics_requeue_dead_letters(interval)'::regprocedure,
       E'    WHERE state = ''dead_letter''\n      AND updated_at <= clock_timestamp() - p_min_age\n  LOOP',
       E'    WHERE state = ''dead_letter''\n      AND updated_at <= clock_timestamp() - p_min_age\n      AND requeue_count < 3\n  LOOP'),
      ('app.metrics_requeue_dead_letters(interval)'::regprocedure,
       E'  v_singles integer := 0;\nBEGIN',
       E'  v_singles integer := 0;\n  v_marked record;\nBEGIN'),
      ('app.metrics_requeue_dead_letters(interval)'::regprocedure,
       E'      PERFORM app.metrics_mark_dirty(\n        v_row.tenant_id, v_row.domain, v_row.source_type, v_row.source_id,\n        p_dirty_from => v_row.dirty_from, p_dirty_to => v_row.dirty_to\n      );',
       E'      -- (a loop, not a CTE: rows inserted by the function are invisible to the same statement)\n      FOR v_marked IN\n        SELECT * FROM app.metrics_mark_dirty(\n          v_row.tenant_id, v_row.domain, v_row.source_type, v_row.source_id,\n          p_dirty_from => v_row.dirty_from, p_dirty_to => v_row.dirty_to\n        )\n      LOOP\n        UPDATE app.metrics_dirty_work w SET requeue_count = v_row.requeue_count + 1 WHERE w.id = v_marked.work_id;\n      END LOOP;'),
      ('app.metrics_requeue_dead_letters(interval)'::regprocedure,
       E'      SET state = ''pending'',\n          attempts = 0,',
       E'      SET state = ''pending'',\n          attempts = 0,\n          requeue_count = requeue_count + 1,')
    ) AS t(fn, old_txt, new_txt)
  LOOP
    v_def := pg_get_functiondef(r.fn);
    IF position(r.new_txt IN v_def) > 0 THEN
      CONTINUE; -- already patched
    END IF;
    IF (length(v_def) - length(replace(v_def, r.old_txt, ''))) <> length(r.old_txt) THEN
      RAISE EXCEPTION 'phase4 patch target not found exactly once in %', r.fn;
    END IF;
    EXECUTE replace(v_def, r.old_txt, r.new_txt);
  END LOOP;
END
$patch$;

-- ---------------------------------------------------------------------------------------------
-- 4. capture trigger value guards
-- ---------------------------------------------------------------------------------------------
DO $guards$
DECLARE
  r record;
  v_when text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('buyer_app_activity', 'trg_metrics_v2_capture_buyer_app_activity', 'metrics_capture_buyer_app_activity',
        ARRAY['buyer_id','location_id','occurred_day','qualifies_for_engagement','deleted_at']),
      ('buyer_users', 'trg_metrics_v2_capture_buyer_users', 'metrics_capture_buyer_users',
        ARRAY['buyer_id','user_id','role','is_active','deleted_at','phone','first_name','last_name','email','designation','department']),
      ('buyers', 'trg_metrics_v2_capture_buyers', 'metrics_capture_buyers',
        ARRAY['tenant_id','business_name','contact_name','phone','email','gstin','geography','credit_limit','payment_terms_days','tier','is_active','deleted_at','default_cohort_id','buyer_app_enabled','status','billing_address','shipping_address','whatsapp_consent_at','whatsapp_opt_out_at']),
      ('estimate_items', 'trg_metrics_v2_capture_estimate_items', 'metrics_capture_estimate_items',
        ARRAY['estimate_id','tenant_product_id','qty','unit_price','tax_rate','line_total','deleted_at','discount_pct','disc_pct','tax_pct']),
      ('estimates', 'trg_metrics_v2_capture_estimates', 'metrics_capture_estimates',
        ARRAY['tenant_id','buyer_id','status','campaign_id','subtotal','tax_amount','total_amount','source','converted_to_order_id','converted_to_invoice_id','deleted_at','estimate_date','location_id','is_buyer_app_estimate']),
      ('invoice_items', 'trg_metrics_v2_capture_invoice_items', 'metrics_capture_invoice_items',
        ARRAY['invoice_id','tenant_product_id','qty','unit_price','tax_rate','line_total','deleted_at','disc_pct','tax_pct']),
      ('invoices', 'trg_metrics_v2_capture_invoices', 'metrics_capture_invoices',
        ARRAY['tenant_id','buyer_id','order_id','invoice_date','status','subtotal','tax_amount','total_amount','outstanding_balance','deleted_at','due_date','paid_at','estimate_id','location_id','is_buyer_app_invoice']),
      ('locations', 'trg_metrics_v2_capture_locations', 'metrics_capture_locations',
        ARRAY['tenant_id','name','address','is_default','deleted_at','phone_number','status','associated_users']),
      ('order_items', 'trg_metrics_v2_capture_order_items', 'metrics_capture_order_items',
        ARRAY['order_id','tenant_product_id','qty','unit_price','tax_rate','line_total','deleted_at','disc_pct','tax_pct']),
      ('orders', 'trg_metrics_v2_capture_orders', 'metrics_capture_orders',
        ARRAY['tenant_id','buyer_id','status','source','campaign_id','subtotal','tax_amount','total_amount','placed_at','deleted_at','estimate_id','location_id','order_date','is_buyer_app_order']),
      ('tenant_brands', 'trg_metrics_v2_capture_tenant_brands', 'metrics_capture_tenant_brands',
        ARRAY['tenant_id','master_brand_id','display_name_override','is_active','deleted_at','default_cohort_id','slug','categories']),
      ('tenant_inventory', 'trg_metrics_v2_capture_inventory', 'metrics_capture_inventory',
        ARRAY['tenant_product_id','qty_available','qty_reserved','reorder_point','deleted_at','warehouse_id']),
      ('tenant_products', 'trg_metrics_v2_capture_tenant_products', 'metrics_capture_tenant_products',
        ARRAY['tenant_id','tenant_brand_id','master_product_id','internal_sku','name_override','mrp','base_selling_price','cost_price','is_active','deleted_at','tenant_category_id']),
      ('warehouses', 'trg_metrics_v2_capture_warehouses', 'metrics_capture_warehouses',
        ARRAY['tenant_id','location_id','name','external_ref','address','phone_number','status','is_default','associated_users','deleted_at'])
    ) AS t(tbl, trg, fn, cols)
  LOOP
    SELECT string_agg(format('OLD.%I IS DISTINCT FROM NEW.%I', c, c), ' OR ')
      INTO v_when FROM unnest(r.cols) AS c;

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON app.%I', r.trg, r.tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON app.%I', r.trg || '_upd', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.%I()',
      r.trg, r.tbl, r.fn);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER UPDATE OF %s ON app.%I FOR EACH ROW WHEN (%s) EXECUTE FUNCTION app.%I()',
      r.trg || '_upd', (SELECT string_agg(quote_ident(c), ', ') FROM unnest(r.cols) AS c), r.tbl, v_when, r.fn);
  END LOOP;
END
$guards$;

-- ---------------------------------------------------------------------------------------------
-- 5. no-op update suppression on the summary / snapshot tables
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.metrics_suppress_noop_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  -- generation_id is regenerated (gen_random_uuid()) by every upsert and read by nothing in the app;
  -- the original design (tests/metrics_v2_phase_3_manual_refresh_kernel.sql, "identical replay rewrote
  -- setup snapshot") requires an identical replay to leave updated_at/computed_at/generation_id alone.
  -- Freshness is tracked in app.metrics_refresh_state, not on these rows.
  c_ignore constant text[] := ARRAY['source_watermark', 'computed_at', 'updated_at', 'updated_by',
                                    'created_at', 'created_by', 'generation_id'];
BEGIN
  IF (to_jsonb(NEW) - c_ignore) IS NOT DISTINCT FROM (to_jsonb(OLD) - c_ignore) THEN
    RETURN NULL; -- identical business values: skip the write entirely
  END IF;
  RETURN NEW;
END;
$$;

DO $noop$
DECLARE
  v_tbl text;
BEGIN
  FOR v_tbl IN
    SELECT unnest(ARRAY[
      'metrics_brand_now_summary','metrics_brand_period_summary','metrics_buyer_now_summary',
      'metrics_buyer_period_summary','metrics_campaign_period_summary','metrics_category_now_summary',
      'metrics_category_period_summary','metrics_cohort_period_summary','metrics_landing_kpi_snapshot',
      'metrics_location_daily','metrics_location_now_summary','metrics_location_period_summary',
      'metrics_price_lists_now_summary','metrics_product_period_summary','metrics_tenant_daily',
      'metrics_tenant_now_summary','metrics_tenant_period_summary','metrics_tenant_top80_cache',
      'metrics_warehouse_now_summary','metrics_warehouse_period_summary'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_metrics_suppress_noop_update ON app.%I', v_tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_metrics_suppress_noop_update BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.metrics_suppress_noop_update()',
      v_tbl);
  END LOOP;
END
$noop$;

-- ---------------------------------------------------------------------------------------------
-- 5b. merge OVERLAPPING pending date-range rows
-- ---------------------------------------------------------------------------------------------
-- metrics_mark_sync_completion marks a 90-day trailing window per sync job and phase, so a busy day
-- leaves dozens of overlapping 7-day windows for the same tenant/domain. Each costs a full compute
-- (9-20 s on prod) even though recomputing an overlapping day twice is pure waste (recompute is
-- idempotent per window; a later change re-marks). Overlapping pending, un-started pure-range rows of
-- one tenant/domain/source_type are replaced by the union window (re-chunked to <= 7 days by
-- metrics_mark_dirty). Merely ADJACENT windows are left alone so the result is stable across runs.
CREATE OR REPLACE FUNCTION app.metrics_coalesce_pending_windows(p_max_islands integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  r        record;
  v_marked record;
  v_ids    uuid[];
  v_merged integer := 0;
BEGIN
  FOR r IN
    WITH cand AS (
      SELECT w.id, w.tenant_id, w.domain, w.source_type, w.dirty_from, w.dirty_to
      FROM app.metrics_dirty_work w
      WHERE w.state = 'pending' AND w.cursor_kind IS NULL AND w.lease_owner IS NULL
        AND w.dirty_from IS NOT NULL AND w.dirty_to IS NOT NULL
        AND w.old_buyer_id IS NULL AND w.new_buyer_id IS NULL
        AND w.old_tenant_product_id IS NULL AND w.new_tenant_product_id IS NULL
        AND w.old_location_id IS NULL AND w.new_location_id IS NULL
    ), prev AS (
      SELECT c.*,
             max(c.dirty_to) OVER (
               PARTITION BY c.tenant_id, c.domain, c.source_type
               ORDER BY c.dirty_from, c.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max_to
      FROM cand c
    ), flagged AS (
      SELECT p.*, CASE WHEN p.prev_max_to IS NULL OR p.dirty_from > p.prev_max_to THEN 1 ELSE 0 END AS starts_island
      FROM prev p
    ), islands AS (
      SELECT f.*, sum(f.starts_island) OVER (
               PARTITION BY f.tenant_id, f.domain, f.source_type
               ORDER BY f.dirty_from, f.id) AS island_no
      FROM flagged f
    )
    SELECT i.tenant_id, i.domain, i.source_type, i.island_no,
           min(i.dirty_from) AS from_d, max(i.dirty_to) AS to_d,
           array_agg(i.id) AS ids, count(*)::integer AS n
    FROM islands i
    GROUP BY i.tenant_id, i.domain, i.source_type, i.island_no
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT GREATEST(p_max_islands, 1)
  LOOP
    v_ids := ARRAY[]::uuid[];
    FOR v_marked IN
      SELECT * FROM app.metrics_mark_dirty(
        r.tenant_id, r.domain, r.source_type, gen_random_uuid(),
        p_dirty_from => r.from_d, p_dirty_to => r.to_d)
    LOOP
      v_ids := v_ids || v_marked.work_id;
    END LOOP;

    UPDATE app.metrics_dirty_work w
    SET state = 'completed', completed_at = clock_timestamp(),
        last_error = 'superseded_merged_window', updated_at = clock_timestamp()
    WHERE w.id = ANY (r.ids) AND NOT (w.id = ANY (v_ids)) AND w.state = 'pending';

    v_merged := v_merged + r.n;
  END LOOP;
  RETURN v_merged;
END;
$$;

REVOKE ALL ON FUNCTION app.metrics_coalesce_pending_windows(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.metrics_coalesce_pending_windows(integer) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 6. the tick procedure
-- ---------------------------------------------------------------------------------------------
-- No SECURITY DEFINER / SET clause on purpose (COMMIT is refused with either). The cron command MUST
-- be exactly `CALL app.metrics_refresh_tick_run();` (a multi-statement command is one implicit
-- transaction and makes COMMIT fail -- verified in phase 3).
CREATE OR REPLACE PROCEDURE app.metrics_refresh_tick_run(
  p_budget_ms integer DEFAULT 20000,
  p_max_groups integer DEFAULT 25
)
LANGUAGE plpgsql
AS $proc$
DECLARE
  v_started    timestamptz := clock_timestamp();
  v_group_at   timestamptz;
  v_last_ms    numeric := 0;
  v_elapsed_ms numeric;
  v_groups     integer := 0;
  v_tok        uuid;
  c            record;
  v_state      text;
  v_msg        text;
  v_stop       boolean := false;
BEGIN
  -- kill switch (same row the claim stage reads; missing row = disabled, as in the claim)
  IF NOT COALESCE((
    SELECT rc.dispatch_enabled FROM app.metrics_runtime_control rc WHERE rc.control_scope = 'global' LIMIT 1
  ), false) THEN
    RETURN;
  END IF;

  -- lease recovery must not depend on there being due work
  IF EXISTS (
    SELECT 1 FROM app.metrics_dirty_work w WHERE w.state = 'claimed' AND w.lease_until < clock_timestamp()
  ) THEN
    PERFORM app.metrics_release_expired_leases(100);
    COMMIT;
  END IF;

  -- idle fast-exit: read-only
  IF NOT EXISTS (
    SELECT 1 FROM app.metrics_dirty_work w
    WHERE w.state = ANY (ARRAY['pending', 'retry']) AND w.next_attempt_at <= clock_timestamp()
  ) THEN
    RETURN;
  END IF;

  -- merge overlapping pending date-range rows so each day is recomputed once, not once per sync job
  IF (
    SELECT count(*) FROM (
      SELECT 1 FROM app.metrics_dirty_work w
      WHERE w.state = 'pending' AND w.cursor_kind IS NULL AND w.lease_owner IS NULL
        AND w.dirty_from IS NOT NULL AND w.dirty_to IS NOT NULL
        AND w.old_buyer_id IS NULL AND w.new_buyer_id IS NULL
        AND w.old_tenant_product_id IS NULL AND w.new_tenant_product_id IS NULL
        AND w.old_location_id IS NULL AND w.new_location_id IS NULL
      LIMIT 2
    ) x
  ) > 1 THEN
    PERFORM app.metrics_coalesce_pending_windows();
    COMMIT;
  END IF;

  LOOP
    v_elapsed_ms := extract(epoch FROM clock_timestamp() - v_started) * 1000;
    EXIT WHEN v_groups >= p_max_groups
           OR v_elapsed_ms >= p_budget_ms
           OR v_elapsed_ms + v_last_ms > 100000;   -- stay well inside the 120 s statement timeout

    v_tok := gen_random_uuid();
    SELECT * INTO c FROM app.metrics_refresh_tick('claim', v_tok, NULL, NULL, NULL);
    COMMIT; -- claim, lease, refresh_state and the 'started' history row are persisted
    EXIT WHEN c.status IS DISTINCT FROM 'claimed';

    v_groups := v_groups + 1;
    v_group_at := clock_timestamp();

    BEGIN
      PERFORM 1 FROM app.metrics_refresh_tick('compute', COALESCE(c.owner_token, v_tok), c.fencing_epoch, c.tenant_id, c.domain);
      PERFORM 1 FROM app.metrics_refresh_tick('acknowledge', COALESCE(c.owner_token, v_tok), c.fencing_epoch, c.tenant_id, c.domain);
    EXCEPTION WHEN query_canceled OR OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      -- The compute/ack writes of this group were rolled back with the sub-block. The fail and release
      -- stages are committed below, so the attempt, backoff and error are never lost.
      BEGIN
        PERFORM 1 FROM app.metrics_refresh_tick('fail', COALESCE(c.owner_token, v_tok), c.fencing_epoch, c.tenant_id, c.domain, left(v_msg, 500));
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      BEGIN
        PERFORM 1 FROM app.metrics_refresh_tick('release', COALESCE(c.owner_token, v_tok), c.fencing_epoch, c.tenant_id, c.domain);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      -- A real cancellation (57014 that is not our own wall-budget guard) disarms the statement timer
      -- for the rest of this CALL (verified, phase 1 / H2): stop after the bookkeeping above.
      IF v_state = '57014' AND v_msg IS DISTINCT FROM 'metrics_tick_wall_budget_exceeded' THEN
        v_stop := true;
      END IF;
    END;
    COMMIT;
    v_last_ms := extract(epoch FROM clock_timestamp() - v_group_at) * 1000;
    EXIT WHEN v_stop;
  END LOOP;
END;
$proc$;

REVOKE ALL ON PROCEDURE app.metrics_refresh_tick_run(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON PROCEDURE app.metrics_refresh_tick_run(integer, integer) TO service_role;

COMMENT ON PROCEDURE app.metrics_refresh_tick_run(integer, integer) IS
  'Metrics refresh worker. Run via cron as the single statement: CALL app.metrics_refresh_tick_run(); Never call from a pooled/PostgREST session (uses COMMIT).';

-- ---------------------------------------------------------------------------------------------
-- 7. cron registration
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Never modify an existing job: cron.schedule() on an existing name overwrites its schedule.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-refresh-tick') THEN
    RETURN;
  END IF;

  v_jobid := cron.schedule('metrics-refresh-tick', '*/5 * * * *', $cron$CALL app.metrics_refresh_tick_run();$cron$);
  PERFORM cron.alter_job(job_id := v_jobid, active := false);
END;
$$;

DO $cron$
DECLARE
  v_old record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;
  SELECT jobid, active INTO v_old FROM cron.job WHERE jobname = 'metrics-v2-refresh-tick';
  IF FOUND THEN
    IF v_old.active THEN
      -- an environment that still runs the legacy job: keep it running, but on the new procedure
      PERFORM cron.alter_job(job_id := v_old.jobid, command := 'CALL app.metrics_refresh_tick_run();');
    ELSE
      PERFORM cron.unschedule(v_old.jobid);
    END IF;
  END IF;
END
$cron$;

SELECT app.ensure_metrics_refresh_tick_cron_scheduled();

-- ---------------------------------------------------------------------------------------------
-- 8. data hygiene (idempotent)
-- ---------------------------------------------------------------------------------------------
-- keep the oldest pending pure-range row per identical window; the rest are redundant (recompute is
-- idempotent per window and any later change re-marks the window)
WITH ranked AS (
  SELECT w.id,
         row_number() OVER (
           PARTITION BY w.tenant_id, w.domain, w.source_type, w.dirty_from, w.dirty_to
           ORDER BY w.created_at, w.id
         ) AS rn
  FROM app.metrics_dirty_work w
  WHERE w.state IN ('pending', 'retry')
    AND w.dirty_from IS NOT NULL AND w.dirty_to IS NOT NULL
    AND w.old_buyer_id IS NULL AND w.new_buyer_id IS NULL
    AND w.old_tenant_product_id IS NULL AND w.new_tenant_product_id IS NULL
    AND w.old_location_id IS NULL AND w.new_location_id IS NULL
)
UPDATE app.metrics_dirty_work w
SET state = 'completed', completed_at = clock_timestamp(),
    last_error = 'superseded_duplicate_window', updated_at = clock_timestamp()
FROM ranked r
WHERE w.id = r.id AND r.rn > 1;

-- merge overlapping pending windows once now (the tick also does this on every run)
SELECT app.metrics_coalesce_pending_windows(500);

UPDATE app.metrics_execution_history
SET status = 'failed', error_text = COALESCE(error_text, 'abandoned_started'), finished_at = COALESCE(finished_at, clock_timestamp())
WHERE status = 'started' AND started_at < clock_timestamp() - interval '1 hour';
