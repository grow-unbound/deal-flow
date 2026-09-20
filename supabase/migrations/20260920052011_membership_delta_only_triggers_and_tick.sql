-- Phase 3 of the yukti-prod DB recovery (see specs/db-perf-recovery-2026-09-20.md).
-- Membership refresh: delta-only, single-flight, exits fast, cannot spiral.
--
-- 1. TRIGGERS. The 15 trg_membership_* triggers fired on every INSERT/UPDATE/DELETE, so sync
--    upserts that rewrite unchanged rows (invoices: 110k updates, integration syncs) enqueued
--    dirty work for nothing. Each is split into
--      <name>       AFTER INSERT OR DELETE                       (unconditional)
--      <name>_upd   AFTER UPDATE OF <cols> WHEN (OLD.c IS DISTINCT FROM NEW.c OR ...)
--    so an UPDATE that does not change a membership-relevant column never calls the function.
--    Column lists = columns referenced by the evaluate_* / refresh_*_by_id / membership_* functions.
-- 2. TICK. app.membership_refresh_tick_run() (a PROCEDURE, so it can COMMIT per unit):
--      kill switch -> lease recovery -> idle fast-exit (read-only) -> single-flight advisory lock ->
--      loop { pick one unit (light candidates first, one heavy per 25 light) ; claim ; process ;
--             COMMIT } bounded by a wall-clock budget.
--    Progress survives failures (H3), no statement_timeout reliance (H1/H2): heavy units are claimed
--    and attempts incremented in a committed transaction BEFORE they run, so a cancelled/killed
--    heavy unit converges to dead_letter instead of retrying forever.
--    app.membership_refresh_tick() is now a stub that raises (the old single-transaction loop had
--    no budget and no single-flight).
-- 3. REQUEUE CAP. membership_dirty_work.requeue_count; dead letters are requeued at most 3 times.
-- 4. NO-OP WRITE GUARDS. The four `ON CONFLICT ... DO UPDATE` upserts in the refresh/evaluate
--    functions rewrote every matched row on every run; they now update only when something changed.
-- 5. Job 18 (membership-automatic-refresh-tick) command is repointed at the procedure (still
--    INACTIVE; it is enabled deliberately in phase 8) and the ensure_* function is updated to match.
--
-- Idempotent. Does not enable any job.

-- ---------------------------------------------------------------------------------------------
-- 3. requeue cap (column first: used by the tick and the requeue function)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE app.membership_dirty_work
  ADD COLUMN IF NOT EXISTS requeue_count integer NOT NULL DEFAULT 0;

DO $patch$
DECLARE
  v_def text;
  v_old text;
  v_new text;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('app.membership_requeue_dead_letters(interval)'::regprocedure,
       E'SET state = ''pending'', attempts = 0, next_attempt_at = now(),',
       E'SET state = ''pending'', attempts = 0, requeue_count = requeue_count + 1, next_attempt_at = now(),'),
      ('app.membership_requeue_dead_letters(interval)'::regprocedure,
       E'WHERE state = ''dead_letter'' AND updated_at <= now() - p_min_age;',
       E'WHERE state = ''dead_letter'' AND updated_at <= now() - p_min_age AND requeue_count < 3;'),
      -- 4. no-op write guards on upserts ------------------------------------------------------
      ('app.refresh_price_list_by_id(uuid)'::regprocedure,
       E'    valid_from = CASE WHEN app.price_list_items.deleted_at IS NOT NULL THEN v_now ELSE app.price_list_items.valid_from END,\n    deleted_at = NULL;',
       E'    valid_from = CASE WHEN app.price_list_items.deleted_at IS NOT NULL THEN v_now ELSE app.price_list_items.valid_from END,\n    deleted_at = NULL\n  WHERE app.price_list_items.price IS DISTINCT FROM EXCLUDED.price\n     OR app.price_list_items.deleted_at IS NOT NULL;'),
      ('app.evaluate_product_for_price_lists_v2(uuid)'::regprocedure,
       E'        valid_from = CASE WHEN app.price_list_items.deleted_at IS NOT NULL THEN v_now ELSE app.price_list_items.valid_from END,\n        deleted_at = NULL;',
       E'        valid_from = CASE WHEN app.price_list_items.deleted_at IS NOT NULL THEN v_now ELSE app.price_list_items.valid_from END,\n        deleted_at = NULL\n      WHERE app.price_list_items.price IS DISTINCT FROM EXCLUDED.price\n         OR app.price_list_items.deleted_at IS NOT NULL;'),
      ('app.refresh_campaign_products_by_id(uuid)'::regprocedure,
       E'    DO UPDATE SET updated_at = v_now, deleted_at = NULL;',
       E'    DO UPDATE SET updated_at = v_now, deleted_at = NULL\n    WHERE app.campaign_items.deleted_at IS NOT NULL;'),
      ('app.evaluate_product_for_campaigns_v2(uuid)'::regprocedure,
       E'      DO UPDATE SET updated_at = v_now, deleted_at = NULL;',
       E'      DO UPDATE SET updated_at = v_now, deleted_at = NULL\n      WHERE app.campaign_items.deleted_at IS NOT NULL;')
    ) AS t(fn, old_txt, new_txt)
  LOOP
    v_def := pg_get_functiondef(r.fn);
    v_old := r.old_txt;
    v_new := r.new_txt;
    IF position(v_new IN v_def) > 0 THEN
      CONTINUE; -- already patched
    END IF;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) THEN
      RAISE EXCEPTION 'phase3 patch target not found exactly once in %', r.fn;
    END IF;
    EXECUTE replace(v_def, v_old, v_new);
  END LOOP;
END
$patch$;

-- ---------------------------------------------------------------------------------------------
-- 1. trigger guards
-- ---------------------------------------------------------------------------------------------
DO $guards$
DECLARE
  r record;
  v_when text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('buyers',           'trg_membership_buyer_candidate_dirty',        'trg_membership_buyer_candidate_dirty',        ARRAY['geography','is_active','deleted_at','buyer_app_enabled','status']),
      ('tenant_products',  'trg_membership_product_candidate_dirty',      'trg_membership_product_candidate_dirty',      ARRAY['tenant_brand_id','tenant_category_id','mrp','base_selling_price','is_active','deleted_at']),
      ('tenant_brands',    'trg_membership_brand_products_dirty',         'trg_membership_brand_products_dirty',         ARRAY['master_brand_id','display_name_override','is_active','deleted_at']),
      ('tenant_categories','trg_membership_category_products_dirty',      'trg_membership_category_products_dirty',      ARRAY['name','is_active','deleted_at']),
      ('tenant_inventory', 'trg_membership_inventory_product_dirty',      'trg_membership_inventory_product_dirty',      ARRAY['tenant_product_id','qty_available','reorder_point','deleted_at']),
      ('stock_in_events',  'trg_membership_stock_event_product_dirty',    'trg_membership_inventory_product_dirty',      ARRAY['tenant_product_id','event_at']),
      ('invoices',         'trg_membership_invoice_buyer_dirty',          'trg_membership_order_buyer_dirty',            ARRAY['buyer_id','order_id','invoice_date','status','total_amount','deleted_at','location_id']),
      ('orders',           'trg_membership_order_buyer_dirty',            'trg_membership_order_buyer_dirty',            ARRAY['buyer_id','status','campaign_id','total_amount','placed_at','order_date','deleted_at','location_id']),
      ('estimates',        'trg_membership_estimate_buyer_dirty',         'trg_membership_order_buyer_dirty',            ARRAY['buyer_id','status','campaign_id','total_amount','valid_until','estimate_date','deleted_at','location_id']),
      ('invoice_items',    'trg_membership_invoice_item_product_dirty',   'trg_membership_document_item_product_dirty',  ARRAY['invoice_id','tenant_product_id','qty','unit_price','deleted_at']),
      ('estimate_items',   'trg_membership_estimate_item_product_dirty',  'trg_membership_document_item_product_dirty',  ARRAY['estimate_id','tenant_product_id','qty','unit_price','deleted_at']),
      ('order_items',      'trg_membership_order_item_product_dirty',     'trg_membership_document_item_product_dirty',  ARRAY['order_id','tenant_product_id','qty','unit_price','deleted_at']),
      ('cohorts',          'trg_membership_cohort_target_dirty',          'trg_membership_target_dirty',                 ARRAY['rules','membership_mode','deleted_at']),
      ('price_lists',      'trg_membership_price_list_target_dirty',      'trg_membership_target_dirty',                 ARRAY['valid_from','is_active','deleted_at','pricing_strategy','strategy_value','filters','membership_mode']),
      ('campaigns',        'trg_membership_campaign_target_dirty',        'trg_membership_target_dirty',                 ARRAY['valid_from','status','deleted_at','is_dynamic','dynamic_rules','buyer_target_mode','buyer_filter_rules','product_membership_mode','pricing_source','price_list_id','pricing_strategy','strategy_value'])
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
-- 2. the tick procedure
-- ---------------------------------------------------------------------------------------------
-- No SECURITY DEFINER / SET clause on purpose: Postgres refuses COMMIT inside either. It is invoked
-- by pg_cron as postgres; everything inside is schema-qualified.
-- The cron command MUST be exactly this single statement: `CALL app.membership_refresh_tick_run();`.
-- pg_cron sends a multi-statement command as one implicit transaction, which makes the COMMITs below
-- fail with "invalid transaction termination" (verified on dev), so no `SET ...;` prefix is possible.
CREATE OR REPLACE PROCEDURE app.membership_refresh_tick_run(
  p_budget_ms   integer DEFAULT 8000,
  p_max_units   integer DEFAULT 500,
  p_max_heavy   integer DEFAULT 5
)
LANGUAGE plpgsql
AS $proc$
DECLARE
  c_lock_key   constant bigint := hashtextextended('app.membership_refresh_tick_run', 0);
  v_started    timestamptz := clock_timestamp();
  v_elapsed_ms numeric;
  v_row        record;
  v_units      integer := 0;
  v_heavy      integer := 0;
  v_light_run  integer := 0;
BEGIN
  -- kill switch (missing row = enabled)
  IF NOT COALESCE((
    SELECT c.dispatch_enabled FROM app.membership_runtime_control c
    WHERE c.control_scope = 'global' AND c.deleted_at IS NULL LIMIT 1
  ), true) THEN
    RETURN;
  END IF;

  -- lease recovery: a heavy unit that was cancelled/killed stays 'claimed' until its lease expires
  UPDATE app.membership_dirty_work
  SET state = CASE WHEN attempts >= 5 THEN 'dead_letter' ELSE 'pending' END,
      next_attempt_at = now() + LEAST(interval '30 minutes', interval '30 seconds' * power(2, attempts)),
      last_error = COALESCE(last_error, 'lease_expired'),
      lease_owner = NULL, lease_until = NULL, updated_at = now()
  WHERE state = 'claimed' AND lease_until < now();

  -- idle fast-exit: read-only, no lock, no writes
  IF NOT EXISTS (
    SELECT 1 FROM app.membership_dirty_work WHERE state = 'pending' AND next_attempt_at <= now()
  ) THEN
    RETURN;
  END IF;

  COMMIT; -- end the (possibly writing) recovery transaction before the loop

  LOOP
    v_elapsed_ms := extract(epoch FROM clock_timestamp() - v_started) * 1000;
    EXIT WHEN v_units >= p_max_units OR v_elapsed_ms >= p_budget_ms;

    -- single-flight: transaction-scoped so it can never leak; released at every COMMIT and
    -- re-acquired at the start of each unit. A competing runner makes us step aside.
    EXIT WHEN NOT pg_try_advisory_xact_lock(c_lock_key);

    SELECT w.id, w.tenant_id, w.entity_type, w.entity_id, w.attempts,
           (w.entity_type NOT IN ('buyer_candidate', 'product_candidate')) AS is_heavy
      INTO v_row
    FROM app.membership_dirty_work w
    WHERE w.state = 'pending'
      AND w.next_attempt_at <= now()
      AND (w.entity_type IN ('buyer_candidate', 'product_candidate')
           OR (v_heavy < p_max_heavy AND v_elapsed_ms < p_budget_ms / 2.0))
    ORDER BY
      CASE
        WHEN w.entity_type NOT IN ('buyer_candidate', 'product_candidate') AND v_light_run >= 25 THEN 0
        WHEN w.entity_type IN ('buyer_candidate', 'product_candidate') THEN 1
        ELSE 2
      END,
      w.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN NOT FOUND;

    IF v_row.is_heavy THEN
      -- committed claim + attempt BEFORE running: writers get a fresh pending row for changes that
      -- land during the long compute, and a cancelled/killed unit still burns an attempt.
      UPDATE app.membership_dirty_work
      SET state = 'claimed', attempts = attempts + 1, lease_owner = gen_random_uuid(),
          lease_until = now() + interval '10 minutes', updated_at = now()
      WHERE id = v_row.id;
      COMMIT;
      -- the COMMIT released the single-flight lock; re-take it (blocking, bounded by one unit of a
      -- competitor) so mutual exclusion also covers the long compute below
      PERFORM pg_advisory_xact_lock(c_lock_key);
      v_heavy := v_heavy + 1;
      v_light_run := 0;
    ELSE
      UPDATE app.membership_dirty_work
      SET state = 'claimed', attempts = attempts + 1, lease_owner = gen_random_uuid(),
          lease_until = now() + interval '2 minutes', updated_at = now()
      WHERE id = v_row.id;
      v_light_run := v_light_run + 1;
    END IF;

    -- NOTE: only OTHERS is caught. query_canceled is deliberately NOT caught: catching it would
    -- leave the rest of this CALL with no statement timeout (verified on dev, phase 1 / H2).
    BEGIN
      IF v_row.entity_type = 'cohort' THEN
        PERFORM app.refresh_cohort_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'price_list' THEN
        PERFORM app.refresh_price_list_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'campaign_buyers' THEN
        PERFORM app.refresh_campaign_buyers_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'campaign_products' THEN
        PERFORM app.refresh_campaign_products_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'buyer_candidate' THEN
        PERFORM app.evaluate_buyer_for_cohorts_v2(v_row.entity_id);
        PERFORM app.evaluate_buyer_for_campaign_buyers(v_row.entity_id);
      ELSIF v_row.entity_type = 'product_candidate' THEN
        PERFORM app.evaluate_product_for_price_lists_v2(v_row.entity_id);
        PERFORM app.evaluate_product_for_campaigns_v2(v_row.entity_id);
      END IF;

      UPDATE app.membership_dirty_work
      SET state = 'done', lease_owner = NULL, lease_until = NULL, last_error = NULL, updated_at = now()
      WHERE id = v_row.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE app.membership_dirty_work
      SET state = CASE WHEN v_row.attempts + 1 >= 5 THEN 'dead_letter' ELSE 'pending' END,
          attempts = v_row.attempts + 1,
          next_attempt_at = now() + LEAST(interval '30 minutes', interval '30 seconds' * power(2, v_row.attempts + 1)),
          last_error = left(SQLERRM, 500),
          lease_owner = NULL, lease_until = NULL, updated_at = now()
      WHERE id = v_row.id;
    END;

    v_units := v_units + 1;
    COMMIT;
  END LOOP;
END;
$proc$;

REVOKE ALL ON PROCEDURE app.membership_refresh_tick_run(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON PROCEDURE app.membership_refresh_tick_run(integer, integer, integer) TO service_role;

COMMENT ON PROCEDURE app.membership_refresh_tick_run(integer, integer, integer) IS
  'Membership refresh worker. Run via cron: CALL app.membership_refresh_tick_run(); Never call from a pooled/PostgREST session (uses COMMIT).';

-- the old single-transaction tick: fail loudly instead of running without budget/single-flight
CREATE OR REPLACE FUNCTION app.membership_refresh_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RAISE EXCEPTION 'app.membership_refresh_tick() is retired; use CALL app.membership_refresh_tick_run()'
    USING ERRCODE = '0A000';
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. job registration: repoint the (inactive) job and the ensure function
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_membership_refresh_tick_cron_scheduled()
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

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-automatic-refresh-tick') THEN
    v_jobid := cron.schedule(
      'membership-automatic-refresh-tick',
      '*/5 * * * *',
      $cron$CALL app.membership_refresh_tick_run();$cron$
    );
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-time-boundary-refresh') THEN
    PERFORM cron.schedule(
      'membership-time-boundary-refresh',
      '5 0 * * *',
      $cron$SELECT app.membership_enqueue_time_boundary_refresh('scheduled_time_boundary');$cron$
    );
  END IF;
END;
$$;

DO $repoint$
DECLARE
  v_jobid bigint;
  v_cmd   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;
  SELECT jobid, command INTO v_jobid, v_cmd FROM cron.job WHERE jobname = 'membership-automatic-refresh-tick';
  IF v_jobid IS NOT NULL AND v_cmd LIKE '%membership_refresh_tick()%' THEN
    -- schedule/active are left as-is; only the command is repointed
    PERFORM cron.alter_job(job_id := v_jobid, command := 'CALL app.membership_refresh_tick_run();');
  END IF;
END
$repoint$;
