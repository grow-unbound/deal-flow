-- Brands: per-tenant snapshot (O(1) count cards) + per-brand daily KPI table.
-- Pattern mirrors perf_snapshot_tables.sql and kpi_aggregates_near_realtime.sql.
-- Triggers are NOT added here; they are wired in trigger_dispatch_consolidation.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. brands_snapshot — one row per tenant, O(1) count card reads
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.brands_snapshot (
  tenant_id           uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  total_count         bigint NOT NULL DEFAULT 0,   -- all non-deleted brands
  active_count        bigint NOT NULL DEFAULT 0,   -- is_active = true
  with_products_count bigint NOT NULL DEFAULT 0,   -- brands with ≥1 active product
  refreshed_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.brands_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read brands_snapshot"
  ON app.brands_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_brands_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.brands_snapshot (
    tenant_id, total_count, active_count, with_products_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active = true),
    COUNT(DISTINCT tb.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM app.tenant_products tp
        WHERE tp.tenant_brand_id = tb.id
          AND tp.is_active = true
          AND tp.deleted_at IS NULL
      )
    ),
    now()
  FROM app.tenant_brands tb
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count         = EXCLUDED.total_count,
    active_count        = EXCLUDED.active_count,
    with_products_count = EXCLUDED.with_products_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. kpi_brand_daily — per-brand daily grain for period trend charts.
-- GMV is attributed at line level (order_items) not order level so multi-brand
-- orders are split correctly across brands.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.kpi_brand_daily (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  tenant_brand_id  uuid NOT NULL,
  day              date NOT NULL,
  gmv              numeric(14,2) NOT NULL DEFAULT 0,
  orders_count     bigint NOT NULL DEFAULT 0,
  buyers_count     bigint NOT NULL DEFAULT 0,
  units_sold       bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_brand_id, day)
);

CREATE INDEX IF NOT EXISTS idx_kpi_brand_daily_lookup
  ON app.kpi_brand_daily (tenant_id, tenant_brand_id, day);

CREATE INDEX IF NOT EXISTS idx_kpi_brand_daily_tenant_day
  ON app.kpi_brand_daily (tenant_id, day);

ALTER TABLE app.kpi_brand_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read kpi_brand_daily"
  ON app.kpi_brand_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

DROP TRIGGER IF EXISTS trg_kpi_brand_daily_updated_at ON app.kpi_brand_daily;
CREATE TRIGGER trg_kpi_brand_daily_updated_at
  BEFORE UPDATE ON app.kpi_brand_daily
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.refresh_kpi_brand_daily(
  p_tenant_id    uuid,
  p_brand_id     uuid,
  p_day          date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_gmv          numeric(14,2);
  v_orders_count bigint;
  v_buyers_count bigint;
  v_units_sold   bigint;
BEGIN
  SELECT
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    COALESCE(SUM(oi.qty), 0)::bigint
  INTO v_gmv, v_orders_count, v_buyers_count, v_units_sold
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id        = p_tenant_id
    AND tp.tenant_brand_id = p_brand_id
    AND o.deleted_at  IS NULL
    AND oi.deleted_at IS NULL
    AND o.status NOT IN ('cancelled', 'draft')
    AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day;

  -- Sparse: skip write when there is no activity for this brand on this day.
  IF v_orders_count = 0 AND v_gmv = 0 THEN
    DELETE FROM app.kpi_brand_daily
    WHERE tenant_id     = p_tenant_id
      AND tenant_brand_id = p_brand_id
      AND day           = p_day;
    RETURN;
  END IF;

  INSERT INTO app.kpi_brand_daily (
    tenant_id, tenant_brand_id, day,
    gmv, orders_count, buyers_count, units_sold, updated_at
  )
  VALUES (
    p_tenant_id, p_brand_id, p_day,
    v_gmv, v_orders_count, v_buyers_count, v_units_sold, now()
  )
  ON CONFLICT (tenant_id, tenant_brand_id, day) DO UPDATE SET
    gmv          = EXCLUDED.gmv,
    orders_count = EXCLUDED.orders_count,
    buyers_count = EXCLUDED.buyers_count,
    units_sold   = EXCLUDED.units_sold,
    updated_at   = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_brand_daily_recent(p_days int DEFAULT 62)
RETURNS void LANGUAGE plpgsql AS $$
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
    -- Insert rows only where there is actual brand activity that day (sparse).
    INSERT INTO app.kpi_brand_daily (
      tenant_id, tenant_brand_id, day,
      gmv, orders_count, buyers_count, units_sold, updated_at
    )
    SELECT
      o.tenant_id,
      tp.tenant_brand_id,
      d,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COUNT(DISTINCT o.id)::bigint,
      COUNT(DISTINCT o.buyer_id)::bigint,
      COALESCE(SUM(oi.qty), 0)::bigint,
      now()
    FROM app.order_items oi
    JOIN app.orders o  ON o.id  = oi.order_id
    JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    WHERE o.deleted_at  IS NULL
      AND oi.deleted_at IS NULL
      AND tp.deleted_at IS NULL
      AND tp.tenant_brand_id IS NOT NULL
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id, tp.tenant_brand_id
    ON CONFLICT (tenant_id, tenant_brand_id, day) DO UPDATE SET
      gmv          = EXCLUDED.gmv,
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      units_sold   = EXCLUDED.units_sold,
      updated_at   = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

-- Seed recent data at migration time.
SELECT app.rebuild_kpi_brand_daily_recent(62);

-- Seed brands_snapshot for all existing tenants.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE deleted_at IS NULL LOOP
    PERFORM app.refresh_brands_snapshot(t.id);
  END LOOP;
END;
$$;
