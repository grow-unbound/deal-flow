-- Metrics V2: mark the 'inventory' domain dirty from invoice_item writes.
--
-- app.metrics_capture_invoice_items (20260716071422_metrics_v2_phase_4_capture_only_validation.sql:259-311)
-- already reads OLD/NEW.tenant_product_id and marks 'commercial' and
-- 'buyer_app' domains dirty, but never 'inventory' -- despite
-- app.metrics_product_snapshot.invoice_units_90d / invoice_value_90d /
-- purchasing_buyers_90d / days_cover (app._metrics_refresh_inventory,
-- 20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:1793-1803)
-- being computed entirely from app.invoice_items. Without this, a product's
-- sales-derived snapshot fields never refresh from real sales at all -- only
-- from stock-level tenant_inventory changes (app.metrics_capture_inventory).
--
-- Found via the raw-vs-v2-inventory.sql reconciliation script: 25/500 seeded
-- products showed invoice_units_90d/invoice_value_90d stuck at a computed_at
-- from before this session started, drifted from raw invoice_items truth,
-- with zero pending 'inventory' dirty work -- i.e. the system believed it
-- was caught up while genuinely stale for these rows.
--
-- 'invoice_item' is not a registered valid source_type for the 'inventory'
-- domain (app.metrics_source_type_valid only allows 'inventory',
-- 'tenant_product', 'warehouse', 'location', 'sync_job', 'age_out',
-- 'reconciliation', 'repair' there); this uses the already-valid
-- 'tenant_product' source_type rather than widening that allow-list.

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

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'inventory', 'tenant_product', v_source_id,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END,
    NULL, NULL,
    NULL, NULL
  );

  RETURN NULL;
END;
$$;
