-- Metrics V2: add the missing capture trigger for app.buyer_app_activity.
--
-- 'buyer_app_activity' is already a registered valid source_type for the
-- 'buyer_app' domain (app.metrics_source_type_valid,
-- 20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:89-92) --
-- this capture path was designed for but never actually wired up in
-- 20260716071422_metrics_v2_phase_4_capture_only_validation.sql, which
-- covered estimates/orders/invoices/items/inventory/tenant_products/
-- tenant_brands/buyers/buyer_users/locations/warehouses but not this table.
--
-- Without it, app._metrics_refresh_buyer_app (which computes
-- active_buyer_count_90d / repeat_buyer_count_90d from app.buyer_app_activity)
-- only ever gets marked dirty for a tenant via order/estimate/invoice
-- activity (app.metrics_capture_orders/estimates/invoices also mark
-- 'buyer_app' domain dirty as a side effect). A tenant whose buyers are
-- actively browsing the Buyer App PWA but not currently transacting would
-- never have its buyer_app snapshot refreshed, so "customers who used the
-- app", "access enabled but never used", and similar adoption-only Action
-- items would silently go stale indefinitely.
--
-- This is purely additive dirty-marking, matching the existing capture
-- trigger pattern (app.metrics_capture_orders et al.) -- no aggregate
-- queries, no snapshot rebuild, no tenant loop.

CREATE OR REPLACE FUNCTION app.metrics_capture_buyer_app_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'buyer_app_activity', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.occurred_day ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.occurred_day ELSE NULL END
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_buyer_app_activity ON app.buyer_app_activity;
CREATE TRIGGER trg_metrics_v2_capture_buyer_app_activity
AFTER INSERT OR DELETE OR UPDATE OF buyer_id, location_id, occurred_day, qualifies_for_engagement, deleted_at
ON app.buyer_app_activity
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_buyer_app_activity();
