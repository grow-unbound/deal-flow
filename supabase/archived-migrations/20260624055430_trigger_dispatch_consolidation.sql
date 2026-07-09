-- Trigger dispatch consolidation.
-- Replaces 21 individual AFTER I/U/D triggers with 9 per-table dispatch functions.
--
-- Before: each source table fires N separate triggers → easy to miss a downstream
--         table when adding a new snapshot; sync-bypass logic is repeated per function.
-- After:  one dispatch trigger per source table calls all required refresh functions
--         in dependency order; bypass flag is read once at the top of each dispatcher.
--
-- Drop order matters: drop triggers first, then recreate dispatch functions + triggers.

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — Drop all individual AFTER I/U/D triggers being replaced
-- ═══════════════════════════════════════════════════════════════════════════

-- app.orders (was 4 triggers)
DROP TRIGGER IF EXISTS trg_orders_refresh_kpi                  ON app.orders;
DROP TRIGGER IF EXISTS trg_orders_refresh_buyer_app_daily      ON app.orders;
DROP TRIGGER IF EXISTS trg_orders_refresh_buyer_app_snapshot   ON app.orders;
DROP TRIGGER IF EXISTS trg_orders_refresh_kpi_location         ON app.orders;

-- app.order_items (was 2 triggers)
DROP TRIGGER IF EXISTS trg_order_items_refresh_kpi             ON app.order_items;
DROP TRIGGER IF EXISTS trg_order_items_refresh_kpi_category    ON app.order_items;

-- app.invoices (was 4 triggers)
DROP TRIGGER IF EXISTS trg_invoices_refresh_snapshot           ON app.invoices;
DROP TRIGGER IF EXISTS trg_invoices_refresh_buyer_app_daily    ON app.invoices;
DROP TRIGGER IF EXISTS trg_invoices_refresh_buyer_app_snapshot ON app.invoices;
DROP TRIGGER IF EXISTS trg_invoices_refresh_locations_snapshot ON app.invoices;

-- app.estimates (was 3 triggers)
DROP TRIGGER IF EXISTS trg_estimates_refresh_snapshot          ON app.estimates;
DROP TRIGGER IF EXISTS trg_estimates_refresh_buyer_app_daily   ON app.estimates;
DROP TRIGGER IF EXISTS trg_estimates_refresh_buyer_app_snapshot ON app.estimates;

-- app.tenant_inventory (was 4 triggers)
DROP TRIGGER IF EXISTS trg_inventory_refresh_kpi               ON app.tenant_inventory;
DROP TRIGGER IF EXISTS trg_inventory_refresh_products_snapshot ON app.tenant_inventory;
DROP TRIGGER IF EXISTS trg_inventory_refresh_locations_snapshot ON app.tenant_inventory;
DROP TRIGGER IF EXISTS trg_inventory_refresh_categories_snapshot ON app.tenant_inventory;

-- app.tenant_products (was 2 triggers)
DROP TRIGGER IF EXISTS trg_tenant_products_refresh_snapshot            ON app.tenant_products;
DROP TRIGGER IF EXISTS trg_tenant_products_refresh_categories_snapshot ON app.tenant_products;

-- app.buyers (was 1 trigger)
DROP TRIGGER IF EXISTS trg_buyers_refresh_snapshot ON app.buyers;

-- app.buyer_users (was 1 trigger)
DROP TRIGGER IF EXISTS trg_buyer_users_refresh_buyer_app_snapshot ON app.buyer_users;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — Create per-table dispatch functions
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- app.orders → dispatch_from_orders
-- Refreshes: kpi_tenant_daily, kpi_location_daily, kpi_buyer_app_daily (bypass-gated),
--            buyer_app_snapshot (bypass-gated)
-- Note: kpi_brand_daily is NOT refreshed here because orders don't carry
--       brand attribution at the row level; brand KPIs derive from order_items.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_bypass    boolean;
  v_tenant    uuid;
  v_location  uuid;
  v_day       date;
  v_is_app    boolean;
BEGIN
  v_bypass   := app.sync_trigger_bypass_active();
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

    IF NOT v_bypass THEN
      IF v_is_app THEN
        PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
      END IF;
      PERFORM app.refresh_buyer_app_snapshot(v_tenant);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_dispatch ON app.orders;
CREATE TRIGGER trg_orders_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_orders();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.order_items → dispatch_from_order_items
-- Refreshes: kpi_tenant_daily, kpi_product_daily, kpi_category_daily,
--            kpi_brand_daily
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

DROP TRIGGER IF EXISTS trg_order_items_dispatch ON app.order_items;
CREATE TRIGGER trg_order_items_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.order_items
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_order_items();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.invoices → dispatch_from_invoices
-- Refreshes: invoices_snapshot, locations_snapshot (if location_id present),
--            kpi_buyer_app_daily (bypass-gated), buyer_app_snapshot (bypass-gated)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_invoices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_bypass   boolean;
  v_tenant   uuid;
  v_location uuid;
  v_date     date;
BEGIN
  v_bypass   := app.sync_trigger_bypass_active();
  v_tenant   := COALESCE(NEW.tenant_id,   OLD.tenant_id);
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_date     := (COALESCE(NEW.invoice_date, OLD.invoice_date, now()::date)
                 AT TIME ZONE 'Asia/Kolkata')::date;

  PERFORM app.refresh_invoices_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_date);
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_dispatch ON app.invoices;
CREATE TRIGGER trg_invoices_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_invoices();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.estimates → dispatch_from_estimates
-- Refreshes: estimates_snapshot, kpi_buyer_app_daily (bypass-gated),
--            buyer_app_snapshot (bypass-gated)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_bypass  boolean;
  v_tenant  uuid;
  v_date    date;
  v_is_app  boolean;
BEGIN
  v_bypass := app.sync_trigger_bypass_active();
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_date   := (COALESCE(NEW.created_at, OLD.created_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app := (TG_OP = 'DELETE')
           OR (NEW.source = 'buyer_app')
           OR (OLD IS NOT NULL AND OLD.source = 'buyer_app');

  PERFORM app.refresh_estimates_snapshot(v_tenant);

  IF NOT v_bypass THEN
    IF v_is_app THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_date);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimates_dispatch ON app.estimates;
CREATE TRIGGER trg_estimates_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.estimates
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_estimates();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.tenant_inventory → dispatch_from_inventory
-- Refreshes: kpi_product_daily (on_hand), products_snapshot, locations_snapshot
--            (if location_id present), categories_snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_product_id uuid;
  v_location   uuid;
  v_tenant     uuid;
  v_today      date;
BEGIN
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

DROP TRIGGER IF EXISTS trg_inventory_dispatch ON app.tenant_inventory;
CREATE TRIGGER trg_inventory_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_inventory
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_inventory();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.tenant_products → dispatch_from_tenant_products
-- Refreshes: products_snapshot, brands_snapshot, categories_snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_tenant_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_brands_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_products_dispatch ON app.tenant_products;
CREATE TRIGGER trg_tenant_products_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_tenant_products();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.tenant_brands → dispatch_from_tenant_brands  (NEW — previously no triggers)
-- Refreshes: brands_snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_tenant_brands()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  PERFORM app.refresh_brands_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_brands_dispatch ON app.tenant_brands;
CREATE TRIGGER trg_tenant_brands_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_brands
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_tenant_brands();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.buyers → dispatch_from_buyers
-- Refreshes: customers_snapshot, buyer_app_snapshot (bypass-gated)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  PERFORM app.refresh_customers_snapshot(v_tenant);

  IF NOT app.sync_trigger_bypass_active() THEN
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyers_dispatch ON app.buyers;
CREATE TRIGGER trg_buyers_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.buyers
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_buyers();

-- ─────────────────────────────────────────────────────────────────────────────
-- app.buyer_users → dispatch_from_buyer_users
-- Refreshes: buyer_app_snapshot (bypass-gated)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_buyer_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  SELECT b.tenant_id INTO v_tenant
  FROM app.buyers b
  WHERE b.id = COALESCE(NEW.buyer_id, OLD.buyer_id);

  IF v_tenant IS NOT NULL THEN
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyer_users_dispatch ON app.buyer_users;
CREATE TRIGGER trg_buyer_users_dispatch
  AFTER INSERT OR UPDATE OR DELETE ON app.buyer_users
  FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_buyer_users();
