-- Metrics V2 Phase 4: capture-only staging validation.
--
-- This migration is intentionally additive:
--   * no application read consumer is changed;
--   * no Metrics V2 feature flag or read-model selector is introduced;
--   * no Cron job is scheduled by this migration;
--   * capture writes only distributed scalar dirty-work rows through the
--     Phase 3 service-only marker.

CREATE OR REPLACE FUNCTION app.metrics_capture_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_day date;
  v_new_day date;
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.estimate_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.estimate_date, NEW.created_at);
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'estimate', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'estimate', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_day date;
  v_new_day date;
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.order_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.order_date, NEW.created_at);
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'order', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'order', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_day date;
  v_new_day date;
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.invoice_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.invoice_date, NEW.created_at);
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'invoice', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'invoice', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_estimate_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_estimate app.estimates%ROWTYPE;
  v_new_estimate app.estimates%ROWTYPE;
  v_old_day date;
  v_new_day date;
  v_tenant_id uuid;
BEGIN
  IF v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO v_old_estimate FROM app.estimates WHERE id = OLD.estimate_id;
    v_old_day := app.metric_day_ist(v_old_estimate.estimate_date, v_old_estimate.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT * INTO v_new_estimate FROM app.estimates WHERE id = NEW.estimate_id;
    v_new_day := app.metric_day_ist(v_new_estimate.estimate_date, v_new_estimate.created_at);
  END IF;

  v_tenant_id := COALESCE(v_new_estimate.tenant_id, v_old_estimate.tenant_id);
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'estimate_item', v_source_id,
    v_old_estimate.buyer_id, v_new_estimate.buyer_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END,
    v_old_estimate.location_id, v_new_estimate.location_id,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'estimate',
    COALESCE(v_new_estimate.id, v_old_estimate.id),
    v_old_estimate.buyer_id, v_new_estimate.buyer_id,
    NULL, NULL,
    v_old_estimate.location_id, v_new_estimate.location_id,
    v_old_day, v_new_day
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_order_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_order app.orders%ROWTYPE;
  v_new_order app.orders%ROWTYPE;
  v_old_day date;
  v_new_day date;
  v_tenant_id uuid;
BEGIN
  IF v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO v_old_order FROM app.orders WHERE id = OLD.order_id;
    v_old_day := app.metric_day_ist(v_old_order.order_date, v_old_order.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT * INTO v_new_order FROM app.orders WHERE id = NEW.order_id;
    v_new_day := app.metric_day_ist(v_new_order.order_date, v_new_order.created_at);
  END IF;

  v_tenant_id := COALESCE(v_new_order.tenant_id, v_old_order.tenant_id);
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'order_item', v_source_id,
    v_old_order.buyer_id, v_new_order.buyer_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END,
    v_old_order.location_id, v_new_order.location_id,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'order',
    COALESCE(v_new_order.id, v_old_order.id),
    v_old_order.buyer_id, v_new_order.buyer_id,
    NULL, NULL,
    v_old_order.location_id, v_new_order.location_id,
    v_old_day, v_new_day
  );

  RETURN NULL;
END;
$$;

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

CREATE OR REPLACE FUNCTION app.metrics_capture_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_product uuid := CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END;
  v_new_product uuid := CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END;
  v_old_location uuid;
  v_new_location uuid;
  v_tenant_id uuid;
BEGIN
  IF v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT w.location_id INTO v_old_location FROM app.warehouses w WHERE w.id = OLD.warehouse_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT w.location_id INTO v_new_location FROM app.warehouses w WHERE w.id = NEW.warehouse_id;
  END IF;

  SELECT tp.tenant_id
  INTO v_tenant_id
  FROM app.tenant_products tp
  WHERE tp.id = COALESCE(v_new_product, v_old_product);

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'inventory', 'inventory', v_source_id,
    NULL, NULL,
    v_old_product, v_new_product,
    v_old_location, v_new_location,
    NULL, NULL
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_tenant_products()
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
    v_tenant_id, 'inventory', 'tenant_product', v_source_id,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END
  );
  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'setup', 'tenant_product', v_source_id,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_tenant_brands()
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

  PERFORM app.metrics_mark_dirty(v_tenant_id, 'setup', 'brand', v_source_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_buyers()
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
    v_tenant_id, 'setup', 'buyer', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'buyer_access', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_buyer_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_buyer uuid := CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END;
  v_new_buyer uuid := CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END;
  v_tenant_id uuid;
BEGIN
  IF v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  SELECT b.tenant_id
  INTO v_tenant_id
  FROM app.buyers b
  WHERE b.id = COALESCE(v_new_buyer, v_old_buyer);

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM app.metrics_mark_dirty(v_tenant_id, 'setup', 'buyer_access', v_source_id, v_old_buyer, v_new_buyer);
  PERFORM app.metrics_mark_dirty(v_tenant_id, 'buyer_app', 'buyer_access', v_source_id, v_old_buyer, v_new_buyer);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_locations()
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
    v_tenant_id, 'inventory', 'location', v_source_id,
    NULL, NULL, NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END
  );
  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'setup', 'location', v_source_id,
    NULL, NULL, NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE NULL END
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_capture_warehouses()
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
    v_tenant_id, 'inventory', 'warehouse', v_source_id,
    NULL, NULL, NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END
  );
  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'setup', 'warehouse', v_source_id,
    NULL, NULL, NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_estimates ON app.estimates;
CREATE TRIGGER trg_metrics_v2_capture_estimates
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, buyer_id, status, campaign_id, subtotal, tax_amount,
  total_amount, source, converted_to_order_id, converted_to_invoice_id, deleted_at, estimate_date,
  location_id, is_buyer_app_estimate
ON app.estimates
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_estimates();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_orders ON app.orders;
CREATE TRIGGER trg_metrics_v2_capture_orders
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, buyer_id, status, source, campaign_id, subtotal,
  tax_amount, total_amount, placed_at, deleted_at, estimate_id, location_id, order_date,
  is_buyer_app_order
ON app.orders
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_orders();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_invoices ON app.invoices;
CREATE TRIGGER trg_metrics_v2_capture_invoices
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, buyer_id, order_id, invoice_date, status, subtotal,
  tax_amount, total_amount, outstanding_balance, deleted_at, due_date, paid_at, estimate_id,
  location_id, is_buyer_app_invoice
ON app.invoices
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_invoices();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_estimate_items ON app.estimate_items;
CREATE TRIGGER trg_metrics_v2_capture_estimate_items
AFTER INSERT OR DELETE OR UPDATE OF estimate_id, tenant_product_id, qty, unit_price, tax_rate,
  line_total, deleted_at, discount_pct, disc_pct, tax_pct
ON app.estimate_items
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_estimate_items();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_order_items ON app.order_items;
CREATE TRIGGER trg_metrics_v2_capture_order_items
AFTER INSERT OR DELETE OR UPDATE OF order_id, tenant_product_id, qty, unit_price, tax_rate,
  line_total, deleted_at, disc_pct, tax_pct
ON app.order_items
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_order_items();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_invoice_items ON app.invoice_items;
CREATE TRIGGER trg_metrics_v2_capture_invoice_items
AFTER INSERT OR DELETE OR UPDATE OF invoice_id, tenant_product_id, qty, unit_price, tax_rate,
  line_total, deleted_at, disc_pct, tax_pct
ON app.invoice_items
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_invoice_items();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_inventory ON app.tenant_inventory;
CREATE TRIGGER trg_metrics_v2_capture_inventory
AFTER INSERT OR DELETE OR UPDATE OF tenant_product_id, qty_available, qty_reserved, reorder_point,
  deleted_at, warehouse_id
ON app.tenant_inventory
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_inventory();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_tenant_products ON app.tenant_products;
CREATE TRIGGER trg_metrics_v2_capture_tenant_products
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, tenant_brand_id, master_product_id, internal_sku,
  name_override, mrp, base_selling_price, cost_price, is_active, deleted_at, tenant_category_id
ON app.tenant_products
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_tenant_products();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_tenant_brands ON app.tenant_brands;
CREATE TRIGGER trg_metrics_v2_capture_tenant_brands
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, master_brand_id, display_name_override, is_active,
  deleted_at, default_cohort_id, slug, categories
ON app.tenant_brands
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_tenant_brands();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_buyers ON app.buyers;
CREATE TRIGGER trg_metrics_v2_capture_buyers
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, business_name, contact_name, phone, email, gstin,
  geography, credit_limit, payment_terms_days, tier, is_active, deleted_at, default_cohort_id,
  buyer_app_enabled, status, billing_address, shipping_address, whatsapp_consent_at,
  whatsapp_opt_out_at
ON app.buyers
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_buyers();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_buyer_users ON app.buyer_users;
CREATE TRIGGER trg_metrics_v2_capture_buyer_users
AFTER INSERT OR DELETE OR UPDATE OF buyer_id, user_id, role, is_active, deleted_at, phone,
  first_name, last_name, email, designation, department
ON app.buyer_users
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_buyer_users();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_locations ON app.locations;
CREATE TRIGGER trg_metrics_v2_capture_locations
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, name, address, is_default, deleted_at,
  phone_number, status, associated_users
ON app.locations
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_locations();

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_warehouses ON app.warehouses;
CREATE TRIGGER trg_metrics_v2_capture_warehouses
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, location_id, name, external_ref, address,
  phone_number, status, is_default, associated_users, deleted_at
ON app.warehouses
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_warehouses();

REVOKE ALL ON FUNCTION app.metrics_capture_estimates() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_invoices() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_estimate_items() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_order_items() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_invoice_items() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_inventory() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_tenant_products() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_tenant_brands() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_buyers() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_buyer_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_locations() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_capture_warehouses() FROM PUBLIC;

COMMENT ON FUNCTION app.metrics_capture_estimates() IS 'Metrics V2 Phase 4 capture-only trigger wrapper. Marks scalar dirty keys; does not compute aggregates.';
COMMENT ON FUNCTION app.metrics_capture_orders() IS 'Metrics V2 Phase 4 capture-only trigger wrapper. Marks scalar dirty keys; does not compute aggregates.';
COMMENT ON FUNCTION app.metrics_capture_invoices() IS 'Metrics V2 Phase 4 capture-only trigger wrapper. Marks scalar dirty keys; does not compute aggregates.';
