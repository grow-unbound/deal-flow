-- Metrics V2: stop the remaining legacy tenant-wide V1 refresh calls on the
-- interactive order/invoice/estimate write path. Phase 0A already scoped the
-- buyer snapshot refreshes down to a single buyer; this migration removes the
-- still-tenant-wide document/day/location snapshot and KPI-daily rebuilds
-- (refresh_orders_snapshot, refresh_invoices_snapshot, refresh_estimates_snapshot,
-- refresh_kpi_orders_daily, refresh_kpi_invoices_daily, refresh_kpi_estimates_daily,
-- refresh_kpi_buyers_daily, refresh_kpi_tenant_daily, refresh_kpi_location_daily,
-- refresh_locations_snapshot, refresh_buyer_app_daily), which were the source of
-- the write-amplification evidence recorded in the Phase 0 audit
-- (buyers_snapshot: 1.4M inserts / 712K deletes for ~15K live rows).
--
-- A consumer-read audit (2026-07-17) confirmed zero seller-facing routes read
-- any V1 snapshot/KPI table directly anymore -- every landing/detail/summary
-- route already reads V2 metrics_* tables or RPCs. V2 dirty-marking for these
-- tables is already handled independently by the Phase 4 capture triggers
-- (trg_metrics_v2_capture_orders/invoices/estimates,
-- 20260716071422_metrics_v2_phase_4_capture_only_validation.sql), so no new
-- dirty-marking call is added here -- this migration is purely subtractive.
--
-- Preserved: the already buyer-scoped refresh_buyers_snapshot_for_buyer /
-- refresh_buyer_current_snapshot_for_buyer calls (cheap, single-buyer, and a
-- rollback escape hatch if V2 reads need to be reverted), and the
-- buyer-app-activity sync calls (sync_buyer_app_activity_from_estimate/order),
-- which are not a metrics refresh and have no V2 replacement yet.
--
-- V1 tables/functions themselves are NOT dropped. Per the implementation
-- plan's retirement sequencing, physical removal happens in a later migration
-- after the post-launch observation window, not here.

CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_old_buyer uuid;
  v_new_buyer uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_buyer := OLD.buyer_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_buyer := NEW.buyer_id;
  END IF;

  IF NOT v_bypass THEN
    IF v_old_buyer IS NOT NULL THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_old_buyer);
    END IF;
    IF v_new_buyer IS NOT NULL AND v_new_buyer IS DISTINCT FROM v_old_buyer THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_new_buyer);
    END IF;

    PERFORM app.sync_buyer_app_activity_from_estimate(COALESCE(NEW.id, OLD.id));
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_old_buyer uuid;
  v_new_buyer uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_buyer := OLD.buyer_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_buyer := NEW.buyer_id;
  END IF;

  IF v_old_buyer IS NOT NULL THEN
    PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_old_buyer);
    PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_old_buyer);
  END IF;
  IF v_new_buyer IS NOT NULL AND v_new_buyer IS DISTINCT FROM v_old_buyer THEN
    PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_new_buyer);
    PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_new_buyer);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_old_buyer uuid;
  v_new_buyer uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_buyer := OLD.buyer_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_buyer := NEW.buyer_id;
  END IF;

  IF NOT v_bypass THEN
    IF v_old_buyer IS NOT NULL THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_old_buyer);
      PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_old_buyer);
    END IF;
    IF v_new_buyer IS NOT NULL AND v_new_buyer IS DISTINCT FROM v_old_buyer THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_new_buyer);
      PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_new_buyer);
    END IF;

    PERFORM app.sync_buyer_app_activity_from_order(COALESCE(NEW.id, OLD.id));
  END IF;

  RETURN NULL;
END;
$$;
