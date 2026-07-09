-- Warehouse landing/detail: per-warehouse snapshot + daily inventory posture KPI.
-- Pattern mirrors app.locations_snapshot + app.kpi_location_daily.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-warehouse snapshot (inventory health)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.warehouses_snapshot (
  warehouse_id          uuid PRIMARY KEY REFERENCES app.warehouses(id) ON DELETE CASCADE,
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  tracked_skus          bigint NOT NULL DEFAULT 0,
  sellable_units        bigint NOT NULL DEFAULT 0,
  low_stock_skus        bigint NOT NULL DEFAULT 0,
  stockout_skus         bigint NOT NULL DEFAULT 0,
  idle_stock_skus       bigint NOT NULL DEFAULT 0,
  last_inventory_update timestamptz,
  refreshed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_snapshot_tenant
  ON app.warehouses_snapshot (tenant_id);

ALTER TABLE app.warehouses_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read warehouses_snapshot"
  ON app.warehouses_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

-- Shared inventory posture aggregation for one warehouse.
CREATE OR REPLACE FUNCTION app.warehouse_inventory_posture(p_warehouse_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  tracked_skus bigint,
  sellable_units bigint,
  low_stock_skus bigint,
  stockout_skus bigint,
  idle_stock_skus bigint,
  last_inventory_update timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app
AS $$
  WITH inv AS (
    SELECT
      ti.tenant_product_id,
      GREATEST(0, COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0)) AS sellable,
      ti.reorder_point,
      ti.updated_at,
      demand.last_demand_at
    FROM app.tenant_inventory ti
    LEFT JOIN LATERAL (
      SELECT MAX(o.placed_at) AS last_demand_at
      FROM app.order_items oi
      JOIN app.orders o ON o.id = oi.order_id
      WHERE oi.tenant_product_id = ti.tenant_product_id
        AND o.deleted_at IS NULL
        AND oi.deleted_at IS NULL
        AND o.status NOT IN ('cancelled', 'draft')
    ) demand ON true
    WHERE ti.warehouse_id = p_warehouse_id
      AND ti.deleted_at IS NULL
  )
  SELECT
    wh.tenant_id,
    COUNT(inv.tenant_product_id)::bigint,
    COALESCE(SUM(inv.sellable), 0)::bigint,
    COUNT(inv.tenant_product_id) FILTER (
      WHERE inv.sellable > 0
        AND inv.reorder_point IS NOT NULL
        AND inv.sellable < inv.reorder_point
    )::bigint,
    COUNT(inv.tenant_product_id) FILTER (
      WHERE inv.sellable <= 0
    )::bigint,
    COUNT(inv.tenant_product_id) FILTER (
      WHERE inv.sellable > 0
        AND (
          inv.last_demand_at IS NULL
          OR inv.last_demand_at < (now() - interval '30 days')
        )
    )::bigint,
    MAX(inv.updated_at)
  FROM app.warehouses wh
  LEFT JOIN inv ON true
  WHERE wh.id = p_warehouse_id
    AND wh.deleted_at IS NULL
  GROUP BY wh.tenant_id;
$$;

CREATE OR REPLACE FUNCTION app.refresh_warehouses_snapshot(p_warehouse_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  INSERT INTO app.warehouses_snapshot (
    warehouse_id,
    tenant_id,
    tracked_skus,
    sellable_units,
    low_stock_skus,
    stockout_skus,
    idle_stock_skus,
    last_inventory_update,
    refreshed_at
  )
  SELECT
    p_warehouse_id,
    posture.tenant_id,
    posture.tracked_skus,
    posture.sellable_units,
    posture.low_stock_skus,
    posture.stockout_skus,
    posture.idle_stock_skus,
    posture.last_inventory_update,
    now()
  FROM app.warehouse_inventory_posture(p_warehouse_id) AS posture
  ON CONFLICT (warehouse_id) DO UPDATE SET
    tenant_id             = EXCLUDED.tenant_id,
    tracked_skus          = EXCLUDED.tracked_skus,
    sellable_units        = EXCLUDED.sellable_units,
    low_stock_skus        = EXCLUDED.low_stock_skus,
    stockout_skus         = EXCLUDED.stockout_skus,
    idle_stock_skus       = EXCLUDED.idle_stock_skus,
    last_inventory_update = EXCLUDED.last_inventory_update,
    refreshed_at          = EXCLUDED.refreshed_at;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-warehouse daily KPI (inventory posture time series)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.kpi_warehouse_daily (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  warehouse_id     uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE CASCADE,
  day              date NOT NULL,
  tracked_skus     bigint NOT NULL DEFAULT 0,
  sellable_units   bigint NOT NULL DEFAULT 0,
  low_stock_skus   bigint NOT NULL DEFAULT 0,
  stockout_skus    bigint NOT NULL DEFAULT 0,
  idle_stock_skus  bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, day)
);

CREATE INDEX IF NOT EXISTS idx_kpi_warehouse_daily_lookup
  ON app.kpi_warehouse_daily (tenant_id, warehouse_id, day);

CREATE INDEX IF NOT EXISTS idx_kpi_warehouse_daily_day_brin
  ON app.kpi_warehouse_daily USING brin (day);

ALTER TABLE app.kpi_warehouse_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read kpi_warehouse_daily"
  ON app.kpi_warehouse_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

DROP TRIGGER IF EXISTS trg_kpi_warehouse_daily_updated_at ON app.kpi_warehouse_daily;
CREATE TRIGGER trg_kpi_warehouse_daily_updated_at
  BEFORE UPDATE ON app.kpi_warehouse_daily
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.refresh_kpi_warehouse_daily(
  p_tenant_id   uuid,
  p_warehouse_id uuid,
  p_day         date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  WITH posture AS (
    SELECT *
    FROM app.warehouse_inventory_posture(p_warehouse_id)
  ),
  sparse_delete AS (
    DELETE FROM app.kpi_warehouse_daily
    WHERE tenant_id    = p_tenant_id
      AND warehouse_id = p_warehouse_id
      AND day          = p_day
      AND EXISTS (
        SELECT 1 FROM posture
        WHERE tracked_skus = 0
          AND sellable_units = 0
          AND low_stock_skus = 0
          AND stockout_skus = 0
          AND idle_stock_skus = 0
      )
    RETURNING 1
  )
  INSERT INTO app.kpi_warehouse_daily (
    tenant_id,
    warehouse_id,
    day,
    tracked_skus,
    sellable_units,
    low_stock_skus,
    stockout_skus,
    idle_stock_skus,
    updated_at
  )
  SELECT
    p_tenant_id,
    p_warehouse_id,
    p_day,
    posture.tracked_skus,
    posture.sellable_units,
    posture.low_stock_skus,
    posture.stockout_skus,
    posture.idle_stock_skus,
    now()
  FROM posture
  WHERE posture.tracked_skus > 0
     OR posture.sellable_units > 0
     OR posture.low_stock_skus > 0
     OR posture.stockout_skus > 0
     OR posture.idle_stock_skus > 0
  ON CONFLICT (tenant_id, warehouse_id, day) DO UPDATE SET
    tracked_skus    = EXCLUDED.tracked_skus,
    sellable_units  = EXCLUDED.sellable_units,
    low_stock_skus  = EXCLUDED.low_stock_skus,
    stockout_skus   = EXCLUDED.stockout_skus,
    idle_stock_skus = EXCLUDED.idle_stock_skus,
    updated_at      = EXCLUDED.updated_at;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_warehouse_daily_for_tenant(
  p_tenant_id uuid,
  p_days      int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  d date;
  wh RECORD;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  FOR d IN
    SELECT generate_series(
      (v_today - p_days),
      v_today,
      interval '1 day'
    )::date
  LOOP
    FOR wh IN
      SELECT id
      FROM app.warehouses
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL
    LOOP
      IF d = v_today OR EXISTS (
        SELECT 1
        FROM app.tenant_inventory ti
        WHERE ti.warehouse_id = wh.id
          AND ti.deleted_at IS NULL
          AND (ti.updated_at AT TIME ZONE 'Asia/Kolkata')::date = d
      ) THEN
        PERFORM app.refresh_kpi_warehouse_daily(p_tenant_id, wh.id, d);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Wire inventory dispatcher + post_sync_rebuild + retention prune
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.dispatch_from_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_product_id uuid;
  v_warehouse_id uuid;
  v_location uuid;
  v_tenant uuid;
  v_today date;
BEGIN
  v_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);
  v_warehouse_id := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT tp.tenant_id INTO v_tenant
  FROM app.tenant_products tp
  WHERE tp.id = v_product_id;

  SELECT wh.location_id INTO v_location
  FROM app.warehouses wh
  WHERE wh.id = v_warehouse_id;

  IF v_tenant IS NULL THEN RETURN NULL; END IF;

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

CREATE OR REPLACE FUNCTION app.post_sync_rebuild(p_tenant_id uuid, p_days int DEFAULT 2)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  loc RECORD;
  wh RECORD;
BEGIN
  PERFORM app.refresh_estimates_snapshot(p_tenant_id);
  PERFORM app.refresh_invoices_snapshot(p_tenant_id);
  PERFORM app.refresh_customers_snapshot(p_tenant_id);
  PERFORM app.refresh_products_snapshot(p_tenant_id);
  PERFORM app.refresh_categories_snapshot(p_tenant_id);
  PERFORM app.refresh_brands_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  FOR loc IN
    SELECT id FROM app.locations
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;

  FOR wh IN
    SELECT id FROM app.warehouses
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_warehouses_snapshot(wh.id);
  END LOOP;

  PERFORM app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_category_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_product_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_location_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_buyer_app_daily_for_tenant(p_tenant_id, p_days);
END;
$$;

CREATE OR REPLACE FUNCTION app.prune_kpi_daily_old_rows(p_retention_days int DEFAULT 90)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  DELETE FROM app.kpi_tenant_daily     WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_product_daily    WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_category_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_location_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_warehouse_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_brand_daily      WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_buyer_app_daily  WHERE snapshot_date < CURRENT_DATE - p_retention_days;
$$;

-- Backfill warehouse snapshots for existing warehouses.
DO $$
DECLARE
  wh RECORD;
BEGIN
  FOR wh IN SELECT id FROM app.warehouses WHERE deleted_at IS NULL LOOP
    PERFORM app.refresh_warehouses_snapshot(wh.id);
  END LOOP;
END;
$$;
