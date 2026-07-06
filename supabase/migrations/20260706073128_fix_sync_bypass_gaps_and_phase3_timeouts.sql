-- Fix: sync trigger bypass gaps and Phase 3 statement timeout coverage.
--
-- Root cause: migration 20260705040441 rewrote dispatch_from_estimates/orders to
-- support is_buyer_app_* flags but dropped the top-level bypass gate, causing
-- refresh_estimates_snapshot and KPI daily refreshes to fire on every row during
-- bulk_persist_jsonb_records (200+ upserts), each hitting the authenticator role's
-- 8s statement_timeout → sync job failures.
--
-- Additionally, reference-data dispatchers (products, brands, buyers, inventory)
-- and standalone location trigger functions never had bypass gates.
--
-- Fix: wrap all snapshot/KPI refreshes in bypass guards so bulk-sync triggers skip
-- them (post_sync_rebuild Phase 3 handles the rebuild after sync completes).
-- Also raises post_sync_rebuild's per-statement timeout to 120s.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. dispatch_from_estimates — regression fix from 20260705040441
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_date   date;
  v_is_app boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  v_date   := COALESCE(NEW.estimate_date, OLD.estimate_date)::date;
  v_is_app := COALESCE(NEW.is_buyer_app_estimate, false);

  IF NOT v_bypass THEN
    PERFORM app.refresh_estimates_snapshot(v_tenant);
    IF v_is_app THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_date);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. dispatch_from_orders — regression fix from 20260705040441
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant   uuid;
  v_bypass   boolean;
  v_location uuid;
  v_day      date;
  v_is_app   boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass   := app.sync_trigger_bypass_active();
  v_location := COALESCE(NEW.ship_to_location_id, OLD.ship_to_location_id);
  v_day      := COALESCE(NEW.placed_at, OLD.placed_at)::date;
  v_is_app   := COALESCE(NEW.is_buyer_app_order, false);

  IF NOT v_bypass THEN
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_day);
      IF v_location IS NOT NULL THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_location, v_day);
      END IF;
    END IF;
    IF v_is_app AND v_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. dispatch_from_tenant_products — was never gated (20260624055430)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_tenant_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_brands_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. dispatch_from_tenant_brands — was never gated (20260624055426)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_tenant_brands()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_brands_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. dispatch_from_buyers — refresh_customers_snapshot was unguarded (20260624055430)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_customers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. dispatch_from_inventory — 6 refresh calls were never gated (20260705163738)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_product_id   uuid;
  v_warehouse_id uuid;
  v_location     uuid;
  v_tenant       uuid;
  v_today        date;
BEGIN
  v_product_id   := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);
  v_warehouse_id := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  v_today        := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT tp.tenant_id INTO v_tenant
  FROM app.tenant_products tp
  WHERE tp.id = v_product_id;

  SELECT wh.location_id INTO v_location
  FROM app.warehouses wh
  WHERE wh.id = v_warehouse_id;

  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  IF v_product_id IS NOT NULL THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_product_id, v_today);
  END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  IF v_warehouse_id IS NOT NULL THEN
    PERFORM app.refresh_warehouses_snapshot(v_warehouse_id);
    PERFORM app.refresh_kpi_warehouse_daily(v_tenant, v_warehouse_id, v_today);
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Standalone location trigger functions — were never gated (20260624000000)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.trg_refresh_locations_snapshot_from_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  target_location uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  IF target_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(target_location);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_locations_snapshot_from_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  target_location uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  IF target_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(target_location);
  END IF;
  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. post_sync_rebuild — raise per-statement timeout for Phase 3 rebuild
-- ─────────────────────────────────────────────────────────────────────────────
ALTER FUNCTION app.post_sync_rebuild(uuid, integer) SET statement_timeout = '120s';
