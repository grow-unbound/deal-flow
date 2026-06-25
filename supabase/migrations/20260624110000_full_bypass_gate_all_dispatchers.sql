-- Full bypass gate for all dispatch functions.
--
-- Previously: bypass only suppressed buyer_app_* in some functions; most snapshot
-- and KPI refreshes fired unconditionally on every row during bulk imports, causing
-- N aggregation queries for N rows and leaving tables inconsistent mid-sync.
--
-- After: every dispatch function short-circuits at the top when the transaction-local
-- bypass flag is active. Zero snapshot/KPI work happens during bulk_persist_jsonb_records
-- calls. Webhooks and normal app writes are unaffected (they never set the flag).
-- A post-sync trigger (see post_sync_rebuild_framework migration) handles the
-- single efficient rebuild after each sync job completes.
--
-- dispatch_from_buyer_users was already fully gated — not changed here.

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_orders
-- kpi_tenant_daily and kpi_location_daily were previously not bypass-gated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant    uuid;
  v_location  uuid;
  v_day       date;
  v_is_app    boolean;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant   := COALESCE(NEW.tenant_id,   OLD.tenant_id);
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_day      := (COALESCE(NEW.placed_at,  OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app   := (TG_OP = 'DELETE')
             OR (NEW.source = 'buyer_app')
             OR (OLD IS NOT NULL AND OLD.source = 'buyer_app');

  IF v_tenant IS NOT NULL AND v_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_day);

    IF v_location IS NOT NULL THEN
      PERFORM app.refresh_kpi_location_daily(v_tenant, v_location, v_day);
    END IF;

    IF v_is_app THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_order_items
-- Had no bypass check at all — fired all 4 KPI refreshes per row during sync.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_order_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_order_id   uuid;
  v_product_id uuid;
  v_tenant     uuid;
  v_day        date;
  v_category   uuid;
  v_brand      uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_order_id   := COALESCE(NEW.order_id,          OLD.order_id);
  v_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);

  SELECT o.tenant_id,
         (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date
    INTO v_tenant, v_day
  FROM app.orders o
  WHERE o.id = v_order_id;

  IF v_tenant IS NULL OR v_day IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_day);

  IF v_product_id IS NOT NULL THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_product_id, v_day);

    SELECT tp.tenant_category_id, tp.tenant_brand_id
      INTO v_category, v_brand
    FROM app.tenant_products tp
    WHERE tp.id = v_product_id;

    IF v_category IS NOT NULL THEN
      PERFORM app.refresh_kpi_category_daily(v_tenant, v_category, v_day);
    END IF;

    IF v_brand IS NOT NULL THEN
      PERFORM app.refresh_kpi_brand_daily(v_tenant, v_brand, v_day);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_invoices
-- invoices_snapshot and locations_snapshot were not bypass-gated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_invoices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant   uuid;
  v_location uuid;
  v_date     date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant   := COALESCE(NEW.tenant_id,   OLD.tenant_id);
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_date     := (COALESCE(NEW.invoice_date, OLD.invoice_date, now()::date)
                 AT TIME ZONE 'Asia/Kolkata')::date;

  PERFORM app.refresh_invoices_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  PERFORM app.refresh_buyer_app_daily(v_tenant, v_date);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_estimates
-- estimates_snapshot was not bypass-gated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant  uuid;
  v_date    date;
  v_is_app  boolean;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_date   := (COALESCE(NEW.created_at, OLD.created_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app := (TG_OP = 'DELETE')
           OR (NEW.source = 'buyer_app')
           OR (OLD IS NOT NULL AND OLD.source = 'buyer_app');

  PERFORM app.refresh_estimates_snapshot(v_tenant);

  IF v_is_app THEN
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_date);
  END IF;
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_inventory
-- Had no bypass check — fired 4 refreshes per row during bulk inventory sync.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_product_id uuid;
  v_location   uuid;
  v_tenant     uuid;
  v_today      date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);
  v_location   := COALESCE(NEW.location_id,       OLD.location_id);
  v_today      := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT tp.tenant_id INTO v_tenant
  FROM app.tenant_products tp
  WHERE tp.id = v_product_id;

  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF v_product_id IS NOT NULL THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_product_id, v_today);
  END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_tenant_products
-- Had no bypass check — fired 3 snapshot refreshes per row during bulk sync.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_tenant_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_brands_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_tenant_brands
-- Had no bypass check at all.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_tenant_brands()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  PERFORM app.refresh_brands_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dispatch_from_buyers
-- customers_snapshot was not bypass-gated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  PERFORM app.refresh_customers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- dispatch_from_buyer_users is already fully gated (early RETURN NULL) — no change.
