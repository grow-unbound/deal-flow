-- Metrics V2: revert the per-invoice-item 'inventory' domain dirty-mark
-- added in 20260717092305_metrics_v2_capture_inventory_from_invoice_items.sql.
--
-- Product owner feedback: ERP-integrated tenants (Zoho, and likely others
-- later) sync app.tenant_inventory once/day as a snapshot; invoices usually
-- originate in the ERP and sync into Yukti in bulk, not via interactive
-- writes. Marking 'inventory' domain dirty on every invoice_item write
-- causes a metrics_product_snapshot refresh whose on_hand/available/
-- low_stock/out_of_stock fields haven't actually changed (they only change
-- once/day, at ERP sync time) -- unnecessary refresh churn, the exact
-- pattern this whole program exists to eliminate.
--
-- The fix is not "don't refresh product sales velocity from invoices" --
-- app._metrics_refresh_inventory already derives invoice_units_90d /
-- invoice_value_90d / days_cover from app.invoice_items, not from
-- tenant_inventory; that formula is unchanged and correct. The fix is
-- *cadence*: product-level sales velocity and stock levels both update once
-- a day via the new daily reconciliation sweep
-- (20260717095500_metrics_v2_daily_reconciliation.sql), timed to run after
-- the tenant's integration sync completes, rather than per-event.
--
-- This restores app.metrics_capture_invoice_items to exactly its
-- 20260716071422_metrics_v2_phase_4_capture_only_validation.sql definition
-- (commercial + buyer_app only).

CREATE OR REPLACE FUNCTION app.metrics_capture_invoice_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_invoice app.invoices%ROWTYPE;
  v_new_invoice app.invoices%ROWTYPE;
  v_old_day date;
  v_new_day date;
  v_tenant_id uuid;
BEGIN
  IF v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO v_old_invoice FROM app.invoices WHERE id = OLD.invoice_id;
    v_old_day := app.metric_day_ist(v_old_invoice.invoice_date, v_old_invoice.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT * INTO v_new_invoice FROM app.invoices WHERE id = NEW.invoice_id;
    v_new_day := app.metric_day_ist(v_new_invoice.invoice_date, v_new_invoice.created_at);
  END IF;

  v_tenant_id := COALESCE(v_new_invoice.tenant_id, v_old_invoice.tenant_id);
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'invoice_item', v_source_id,
    v_old_invoice.buyer_id, v_new_invoice.buyer_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END,
    v_old_invoice.location_id, v_new_invoice.location_id,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'invoice',
    COALESCE(v_new_invoice.id, v_old_invoice.id),
    v_old_invoice.buyer_id, v_new_invoice.buyer_id,
    NULL, NULL,
    v_old_invoice.location_id, v_new_invoice.location_id,
    v_old_day, v_new_day
  );

  RETURN NULL;
END;
$$;
