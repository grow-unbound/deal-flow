-- Categories landing: per-tenant snapshot + per-category daily KPI table.
-- Pattern mirrors perf_snapshot_tables.sql and kpi_aggregates_near_realtime.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tenant-level categories snapshot (InsightStrip4 tiles — O(1) reads)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.categories_snapshot (
  tenant_id           uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  active_count        bigint NOT NULL DEFAULT 0,   -- categories with ≥1 active product
  low_stock_count     bigint NOT NULL DEFAULT 0,   -- categories with ≥1 product below reorder_point
  uncategorized_count bigint NOT NULL DEFAULT 0,   -- active products with no category assigned
  refreshed_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.categories_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read categories_snapshot"
  ON app.categories_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_categories_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.categories_snapshot (
    tenant_id, active_count, low_stock_count, uncategorized_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(DISTINCT tp.tenant_category_id) FILTER (
      WHERE tp.is_active = true AND tp.deleted_at IS NULL AND tp.tenant_category_id IS NOT NULL
    ),
    COUNT(DISTINCT tp.tenant_category_id) FILTER (
      WHERE tp.is_active = true
        AND tp.deleted_at IS NULL
        AND tp.tenant_category_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM app.tenant_inventory ti
          WHERE ti.tenant_product_id = tp.id
            AND ti.deleted_at IS NULL
            AND ti.reorder_point IS NOT NULL
            AND ti.qty_available <= ti.reorder_point
        )
    ),
    COUNT(*) FILTER (
      WHERE tp.is_active = true AND tp.deleted_at IS NULL AND tp.tenant_category_id IS NULL
    ),
    now()
  FROM app.tenant_products tp
  WHERE tp.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id) DO UPDATE SET
    active_count        = EXCLUDED.active_count,
    low_stock_count     = EXCLUDED.low_stock_count,
    uncategorized_count = EXCLUDED.uncategorized_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_categories_snapshot_from_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF target_tenant IS NOT NULL THEN
    PERFORM app.refresh_categories_snapshot(target_tenant);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_categories_snapshot_from_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
BEGIN
  SELECT tp.tenant_id INTO target_tenant
  FROM app.tenant_products tp
  WHERE tp.id = COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);
  IF target_tenant IS NOT NULL THEN
    PERFORM app.refresh_categories_snapshot(target_tenant);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_products_refresh_categories_snapshot ON app.tenant_products;
CREATE TRIGGER trg_tenant_products_refresh_categories_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_categories_snapshot_from_products();

DROP TRIGGER IF EXISTS trg_inventory_refresh_categories_snapshot ON app.tenant_inventory;
CREATE TRIGGER trg_inventory_refresh_categories_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_inventory
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_categories_snapshot_from_inventory();

-- Backfill for all existing tenants
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE deleted_at IS NULL LOOP
    PERFORM app.refresh_categories_snapshot(t.id);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-category daily KPI (mirrors kpi_product_daily / kpi_location_daily)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.kpi_category_daily (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  tenant_category_id  uuid NOT NULL,
  day                 date NOT NULL,
  gmv                 numeric(14,2) NOT NULL DEFAULT 0,
  units_sold          bigint NOT NULL DEFAULT 0,
  orders_count        bigint NOT NULL DEFAULT 0,
  buyers_count        bigint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_category_id, day)
);

CREATE INDEX IF NOT EXISTS idx_kpi_category_daily_lookup
  ON app.kpi_category_daily (tenant_id, tenant_category_id, day);

CREATE INDEX IF NOT EXISTS idx_kpi_category_daily_tenant_day
  ON app.kpi_category_daily (tenant_id, day);

ALTER TABLE app.kpi_category_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read kpi_category_daily"
  ON app.kpi_category_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

DROP TRIGGER IF EXISTS trg_kpi_category_daily_updated_at ON app.kpi_category_daily;
CREATE TRIGGER trg_kpi_category_daily_updated_at
  BEFORE UPDATE ON app.kpi_category_daily
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.refresh_kpi_category_daily(
  p_tenant_id        uuid,
  p_category_id      uuid,
  p_day              date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
BEGIN
  INSERT INTO app.kpi_category_daily (
    tenant_id, tenant_category_id, day,
    gmv, units_sold, orders_count, buyers_count, updated_at
  )
  SELECT
    p_tenant_id,
    p_category_id,
    p_day,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE(SUM(oi.qty), 0)::bigint,
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    now()
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND tp.tenant_category_id = p_category_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND o.status NOT IN ('cancelled', 'draft')
    AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day
  ON CONFLICT (tenant_id, tenant_category_id, day) DO UPDATE SET
    gmv          = EXCLUDED.gmv,
    units_sold   = EXCLUDED.units_sold,
    orders_count = EXCLUDED.orders_count,
    buyers_count = EXCLUDED.buyers_count,
    updated_at   = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_kpi_category_from_order_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_order_id   uuid;
  target_product_id uuid;
  target_tenant     uuid;
  target_category   uuid;
  target_day        date;
BEGIN
  target_order_id   := COALESCE(NEW.order_id, OLD.order_id);
  target_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);

  SELECT o.tenant_id,
         (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date,
         tp.tenant_category_id
    INTO target_tenant, target_day, target_category
  FROM app.orders o
  JOIN app.tenant_products tp ON tp.id = target_product_id
  WHERE o.id = target_order_id;

  IF target_tenant IS NOT NULL AND target_category IS NOT NULL AND target_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_category_daily(target_tenant, target_category, target_day);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_refresh_kpi_category ON app.order_items;
CREATE TRIGGER trg_order_items_refresh_kpi_category
  AFTER INSERT OR UPDATE OR DELETE ON app.order_items
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_kpi_category_from_order_items();

CREATE OR REPLACE FUNCTION app.rebuild_kpi_category_daily_recent(p_days int DEFAULT 62)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    INSERT INTO app.kpi_category_daily (
      tenant_id, tenant_category_id, day,
      gmv, units_sold, orders_count, buyers_count, updated_at
    )
    SELECT
      o.tenant_id,
      tp.tenant_category_id,
      d,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COALESCE(SUM(oi.qty), 0)::bigint,
      COUNT(DISTINCT o.id)::bigint,
      COUNT(DISTINCT o.buyer_id)::bigint,
      now()
    FROM app.order_items oi
    JOIN app.orders o   ON o.id  = oi.order_id
    JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    WHERE o.deleted_at  IS NULL
      AND oi.deleted_at IS NULL
      AND tp.deleted_at IS NULL
      AND tp.tenant_category_id IS NOT NULL
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id, tp.tenant_category_id
    ON CONFLICT (tenant_id, tenant_category_id, day) DO UPDATE SET
      gmv          = EXCLUDED.gmv,
      units_sold   = EXCLUDED.units_sold,
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      updated_at   = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

-- Seed recent 62 days at migration time.
SELECT app.rebuild_kpi_category_daily_recent(62);
