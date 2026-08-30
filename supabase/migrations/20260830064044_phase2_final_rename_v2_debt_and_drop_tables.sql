-- Phase 2 part D: close out the remaining "v2" naming debt, then drop the
-- 4 tables whose last live readers were just rewired above.
--
-- Both renamed objects are live v4 infra with a stale v2-era name, NOT
-- v2 logic (confirmed: metrics_v2_run_daily_reconciliation_sweep only
-- calls app.metrics_mark_daily_reconciliation; trg_metrics_v2_post_sync_
-- reconciliation's function only calls app.metrics_mark_dirty -- both are
-- v4 dirty-work/reconciliation queue plumbing). Per owner instruction:
-- "Rename metrics_v2_run_daily_reconciliation_sweep to v4 tag so that
-- this debt ends with this pass." Renaming both for consistency. NOT
-- touching the refresh-tick's own orchestration/fencing -- this is a
-- pure rename, the function bodies and the cron schedule are unchanged.

ALTER FUNCTION app.metrics_v2_run_daily_reconciliation_sweep()
  RENAME TO metrics_v4_run_daily_reconciliation_sweep;

-- cron.job has no rename primitive and direct UPDATE is permission-denied
-- for the migration role -- cron.alter_job only rewrites the command, the
-- jobname 'metrics-v2-daily-reconciliation' stays as the job's label.
-- Harmless: it's a scheduler label, not a code reference -- the actual
-- v2-named function it used to call no longer exists.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'metrics-v2-daily-reconciliation'),
  command := 'SELECT app.metrics_v4_run_daily_reconciliation_sweep()'
);

ALTER FUNCTION app.trg_metrics_v2_post_sync_reconciliation()
  RENAME TO trg_metrics_v4_post_sync_reconciliation;
ALTER TRIGGER trg_metrics_v2_post_sync_reconciliation ON app.integration_sync_jobs
  RENAME TO trg_metrics_v4_post_sync_reconciliation;

-- Table drops. All 4 confirmed to have zero remaining live readers after
-- the 3 rewires in this phase (search_seller_location_landing_ids,
-- search_buyer_app_access_v2, _metrics_v4_refresh_landing_kpis), zero FK
-- constraints pointing at any of them, zero cron jobs, zero enabled
-- triggers other than dispatch_from_inventory (dropped below).
--
-- dispatch_from_inventory's only remaining call was refresh_warehouses_
-- snapshot (kept alive through Phase 1 specifically for this) -- now
-- fully dead. Dropping it drops its trigger (trg_inventory_dispatch) via
-- CASCADE, rather than leaving a no-op trigger on a hot write path.
-- refresh_warehouses_snapshot and its sole helper, warehouse_inventory_
-- posture (confirmed zero other callers), go with it.
DROP FUNCTION IF EXISTS app.dispatch_from_inventory() CASCADE;
DROP FUNCTION IF EXISTS app.refresh_warehouses_snapshot(p_warehouse_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.warehouse_inventory_posture(p_warehouse_id uuid) CASCADE;

DROP TABLE IF EXISTS app.warehouses_snapshot;
DROP TABLE IF EXISTS app.metrics_buyer_snapshot;
DROP TABLE IF EXISTS app.metrics_buyer_location_snapshot;
DROP TABLE IF EXISTS app.metrics_location_snapshot;
