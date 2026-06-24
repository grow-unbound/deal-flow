-- Locations landing: per-location snapshot + daily KPI table for GMV trend charts.
-- Pattern mirrors perf_snapshot_tables.sql and kpi_aggregates_near_realtime.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-location snapshot (inventory health + outstanding dues)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.locations_snapshot (
  location_id         uuid PRIMARY KEY REFERENCES app.locations(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  sku_count           bigint NOT NULL DEFAULT 0,
  oos_sku_count       bigint NOT NULL DEFAULT 0,   -- qty_available <= 0
  low_stock_sku_count bigint NOT NULL DEFAULT 0,   -- qty_available <= reorder_point AND > 0
  outstanding_dues    numeric NOT NULL DEFAULT 0,  -- SUM(outstanding_balance) for unpaid invoices
  oldest_unpaid_days  integer,                     -- days since oldest unpaid invoice
  invoice_count       bigint NOT NULL DEFAULT 0,   -- count of unpaid invoices
  refreshed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_snapshot_tenant
  ON app.locations_snapshot (tenant_id);

ALTER TABLE app.locations_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read locations_snapshot"
  ON app.locations_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_locations_snapshot(p_location_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.locations_snapshot (
    location_id, tenant_id,
    sku_count, oos_sku_count, low_stock_sku_count,
    outstanding_dues, oldest_unpaid_days, invoice_count,
    refreshed_at
  )
  SELECT
    l.id,
    l.tenant_id,
    COUNT(DISTINCT ti.tenant_product_id),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE ti.qty_available <= 0),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE ti.qty_available > 0
        AND ti.reorder_point IS NOT NULL
        AND ti.qty_available <= ti.reorder_point
    ),
    COALESCE(SUM(inv.outstanding_balance) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ), 0),
    MAX(
      EXTRACT(DAY FROM now() - inv.invoice_date)::integer
    ) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ),
    COUNT(inv.id) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ),
    now()
  FROM app.locations l
  LEFT JOIN app.tenant_inventory ti ON ti.location_id = l.id
  LEFT JOIN app.invoices inv ON inv.location_id = l.id AND inv.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
  GROUP BY l.id, l.tenant_id
  ON CONFLICT (location_id) DO UPDATE SET
    tenant_id           = EXCLUDED.tenant_id,
    sku_count           = EXCLUDED.sku_count,
    oos_sku_count       = EXCLUDED.oos_sku_count,
    low_stock_sku_count = EXCLUDED.low_stock_sku_count,
    outstanding_dues    = EXCLUDED.outstanding_dues,
    oldest_unpaid_days  = EXCLUDED.oldest_unpaid_days,
    invoice_count       = EXCLUDED.invoice_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_locations_snapshot_from_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_location uuid;
BEGIN
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  IF target_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(target_location);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_locations_snapshot_from_invoices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_location uuid;
BEGIN
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  IF target_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(target_location);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_refresh_locations_snapshot ON app.tenant_inventory;
CREATE TRIGGER trg_inventory_refresh_locations_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_inventory
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_locations_snapshot_from_inventory();

DROP TRIGGER IF EXISTS trg_invoices_refresh_locations_snapshot ON app.invoices;
CREATE TRIGGER trg_invoices_refresh_locations_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_locations_snapshot_from_invoices();

-- Backfill snapshot for existing locations
DO $$
DECLARE
  loc RECORD;
BEGIN
  FOR loc IN SELECT id FROM app.locations WHERE deleted_at IS NULL LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-location daily KPI (mirrors kpi_product_daily pattern)
--    Used for GMV trend BarChart in Location Detail Overview tab.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.kpi_location_daily (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  location_id  uuid NOT NULL,
  day          date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  buyers_count integer NOT NULL DEFAULT 0,
  gmv          numeric(14,2) NOT NULL DEFAULT 0,
  items_count  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, location_id, day)
);

CREATE INDEX IF NOT EXISTS idx_kpi_location_daily_lookup
  ON app.kpi_location_daily (tenant_id, location_id, day);

ALTER TABLE app.kpi_location_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read kpi_location_daily"
  ON app.kpi_location_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

DROP TRIGGER IF EXISTS trg_kpi_location_daily_updated_at ON app.kpi_location_daily;
CREATE TRIGGER trg_kpi_location_daily_updated_at
  BEFORE UPDATE ON app.kpi_location_daily
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.refresh_kpi_location_daily(
  p_tenant_id   uuid,
  p_location_id uuid,
  p_day         date
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.kpi_location_daily (
    tenant_id, location_id, day,
    orders_count, buyers_count, gmv, items_count,
    updated_at
  )
  SELECT
    p_tenant_id,
    p_location_id,
    p_day,
    COUNT(DISTINCT o.id),
    COUNT(DISTINCT o.buyer_id),
    COALESCE(SUM(o.total_amount), 0),
    COALESCE(SUM(oi.qty), 0),
    now()
  FROM app.orders o
  LEFT JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
  WHERE o.tenant_id    = p_tenant_id
    AND o.location_id  = p_location_id
    AND o.placed_at::date = p_day
    AND o.status NOT IN ('cancelled', 'draft')
    AND o.deleted_at IS NULL
  ON CONFLICT (tenant_id, location_id, day) DO UPDATE SET
    orders_count = EXCLUDED.orders_count,
    buyers_count = EXCLUDED.buyers_count,
    gmv          = EXCLUDED.gmv,
    items_count  = EXCLUDED.items_count,
    updated_at   = EXCLUDED.updated_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_kpi_location_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant   uuid;
  target_location uuid;
  target_day      date;
BEGIN
  target_tenant   := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  target_day      := COALESCE(NEW.placed_at, OLD.placed_at)::date;

  IF target_location IS NOT NULL AND target_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_location_daily(target_tenant, target_location, target_day);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_refresh_kpi_location ON app.orders;
CREATE TRIGGER trg_orders_refresh_kpi_location
  AFTER INSERT OR UPDATE OR DELETE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_kpi_location_daily();
