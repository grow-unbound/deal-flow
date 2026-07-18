-- Metrics V2: daily reconciliation sweep.
--
-- Two things this closes, both found via the raw-vs-v2 reconciliation
-- scripts under scripts/sql/metrics-v2-reconciliation/:
--
-- 1. Trailing-90-day window rolloff: a document that was inside the 90-day
--    window when a snapshot was last computed silently ages out of today's
--    window with no dirty-mark to trigger a recompute (metrics_buyer_snapshot
--    reconciliation showed ~1.3% of buyers stuck one document ahead of raw
--    truth for exactly this reason). app.metrics_mark_age_out already exists
--    to correct this but was never scheduled anywhere.
--
-- 2. Product-level sales velocity/days_cover cadence: per product-owner
--    decision (20260717094732_metrics_v2_revert_invoice_item_inventory_mark.sql),
--    'inventory' domain is intentionally NOT marked dirty per invoice_item
--    write, because ERP-integrated tenants sync tenant_inventory as a daily
--    snapshot and syncing invoices in bulk would otherwise trigger wasted
--    per-event refreshes of stock fields that haven't actually changed.
--    Product sales velocity/days_cover (already invoice_items-derived,
--    app._metrics_refresh_inventory) and stock levels both catch up once a
--    day here instead.
--
-- Two triggers for this sweep, so both integration-enabled and native-only
-- tenants get it:
--
-- A) On integration_sync_jobs completion (top-level job only, mirroring the
--    existing app.trg_post_sync_rebuild gate) -- so an ERP-synced tenant's
--    reconciliation runs right after that day's sync lands, using the
--    freshest inventory/documents, not a guessed delay.
-- B) A fallback daily cron for tenants with no completed sync that day
--    (native-only tenants, or a day an integration tenant's sync didn't
--    run) -- scheduled well after zoho-sync-daily's normal completion
--    window (05:00 IST) so integration tenants are usually already covered
--    by (A) before this runs; running both is harmless since dirty-marking
--    is idempotent range-marker inserts, not a rebuild itself.
--
-- Marking is O(1) per tenant/domain (one range-marker row via
-- metrics_mark_dirty), not a sweep of every buyer/product -- the actual
-- bounded fan-out happens later through the existing cursor-based
-- claim/compute budgets, same as bulk sync markers.

CREATE OR REPLACE FUNCTION app.metrics_mark_daily_reconciliation(p_tenant_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Correct the 90-day trailing-window boundary for the three age-out-eligible domains.
  PERFORM app.metrics_mark_age_out(p_tenant_id, 'commercial', 90);
  PERFORM app.metrics_mark_age_out(p_tenant_id, 'inventory', 90);
  PERFORM app.metrics_mark_age_out(p_tenant_id, 'buyer_app', 90);

  -- Bounded trailing-2-day reconciliation across all four domains: picks up
  -- the day's sales velocity for product/stock fields, the latest synced
  -- inventory snapshot, and any other drift from the last two days.
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'commercial', v_today - 1, v_today);
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'inventory', v_today - 1, v_today);
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'buyer_app', v_today - 1, v_today);
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'setup', v_today - 1, v_today);
END;
$$;

ALTER FUNCTION app.metrics_mark_daily_reconciliation(uuid) OWNER TO postgres;

-- (A) Post-sync trigger: fires once per top-level integration sync job
-- completion, matching app.trg_post_sync_rebuild's own gating.
CREATE OR REPLACE FUNCTION app.trg_metrics_v2_post_sync_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' AND NEW.master_job_id IS NULL THEN
    PERFORM app.metrics_mark_daily_reconciliation(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_metrics_v2_post_sync_reconciliation ON app.integration_sync_jobs;
CREATE TRIGGER trg_metrics_v2_post_sync_reconciliation
AFTER UPDATE ON app.integration_sync_jobs
FOR EACH ROW EXECUTE FUNCTION app.trg_metrics_v2_post_sync_reconciliation();

-- (B) Fallback daily cron for tenants not covered by (A) that day.
CREATE OR REPLACE FUNCTION app.metrics_v2_run_daily_reconciliation_sweep() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM app.tenants WHERE deleted_at IS NULL LOOP
    PERFORM app.metrics_mark_daily_reconciliation(v_tenant.id);
  END LOOP;
END;
$$;

ALTER FUNCTION app.metrics_v2_run_daily_reconciliation_sweep() OWNER TO postgres;

CREATE OR REPLACE FUNCTION app.ensure_metrics_v2_daily_reconciliation_cron_scheduled() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-v2-daily-reconciliation') THEN
    -- 01:00 UTC = 06:30 IST -- 1.5h after zoho-sync-daily's 05:00 IST slot,
    -- so integration tenants are normally already covered by (A) by the
    -- time this runs; it only does real work for tenants (A) didn't reach.
    PERFORM cron.schedule(
      'metrics-v2-daily-reconciliation',
      '0 1 * * *',
      'SELECT app.metrics_v2_run_daily_reconciliation_sweep()'
    );
  END IF;
END;
$$;

ALTER FUNCTION app.ensure_metrics_v2_daily_reconciliation_cron_scheduled() OWNER TO postgres;
REVOKE ALL ON FUNCTION app.ensure_metrics_v2_daily_reconciliation_cron_scheduled() FROM PUBLIC;

SELECT app.ensure_metrics_v2_daily_reconciliation_cron_scheduled();
