-- kpi_*_daily retention policy + BRIN indexes + sparse write guards.
-- Prevents unbounded table growth for high-product or high-category tenants.
--
-- Sparse guard: daily refresh functions skip the INSERT when computed aggregates
-- are all-zero. For product/location/category daily tables this is the main source
-- of bloat (products/locations with no orders on a given day still fire triggers).
--
-- BRIN (Block Range INdex): ~1000× smaller than B-tree for append-only time-series.
-- Complements the existing B-tree composite indexes (used for point lookups).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BRIN indexes on day / snapshot_date columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kpi_tenant_daily_day_brin
  ON app.kpi_tenant_daily USING brin (day);

CREATE INDEX IF NOT EXISTS idx_kpi_product_daily_day_brin
  ON app.kpi_product_daily USING brin (day);

CREATE INDEX IF NOT EXISTS idx_kpi_category_daily_day_brin
  ON app.kpi_category_daily USING brin (day);

CREATE INDEX IF NOT EXISTS idx_kpi_location_daily_day_brin
  ON app.kpi_location_daily USING brin (day);

CREATE INDEX IF NOT EXISTS idx_kpi_brand_daily_day_brin
  ON app.kpi_brand_daily USING brin (day);

CREATE INDEX IF NOT EXISTS idx_buyer_app_daily_date_brin
  ON app.buyer_app_daily USING brin (snapshot_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Retention prune function — called by pg_cron nightly
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.prune_kpi_daily_old_rows(p_retention_days int DEFAULT 90)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  DELETE FROM app.kpi_tenant_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_product_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_category_daily WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_location_daily WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_brand_daily    WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.buyer_app_daily    WHERE snapshot_date < CURRENT_DATE - p_retention_days;
$$;

-- Schedule nightly at 20:00 UTC = 01:30 IST (low-traffic window).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-kpi-daily') THEN
      PERFORM cron.schedule('prune-kpi-daily', '0 20 * * *', 'SELECT app.prune_kpi_daily_old_rows(90)');
    END IF;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sparse write guards — update existing refresh functions to skip zero rows.
--    kpi_product_daily: skip if units_sold = 0 AND revenue = 0 AND on_hand = 0.
--    kpi_category_daily: skip if gmv = 0 AND units_sold = 0.
--    kpi_location_daily: skip if orders_count = 0 AND gmv = 0.
--    kpi_tenant_daily keeps all rows (zero-order days are meaningful business data).
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. kpi_product_daily
CREATE OR REPLACE FUNCTION app.refresh_kpi_product_daily(p_tenant_id uuid, p_tenant_product_id uuid, p_day date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_units  integer;
  v_rev    numeric(14,2);
  v_onhand numeric(14,2);
BEGIN
  SELECT
    COALESCE(SUM(oi.qty), 0)::int,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE((
      SELECT SUM(ti.qty_available)
      FROM app.tenant_inventory ti
      WHERE ti.tenant_product_id = p_tenant_product_id
        AND ti.deleted_at IS NULL
    ), 0)::numeric(14,2)
  INTO v_units, v_rev, v_onhand
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND o.status <> 'cancelled'
    AND oi.tenant_product_id = p_tenant_product_id
    AND oi.deleted_at IS NULL
    AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day;

  -- Sparse: skip write when there is neither sales nor inventory for this product.
  IF v_units = 0 AND v_rev = 0 AND v_onhand = 0 THEN
    DELETE FROM app.kpi_product_daily
    WHERE tenant_id = p_tenant_id
      AND tenant_product_id = p_tenant_product_id
      AND day = p_day;
    RETURN;
  END IF;

  INSERT INTO app.kpi_product_daily (tenant_id, tenant_product_id, day, units_sold, revenue, on_hand)
  VALUES (p_tenant_id, p_tenant_product_id, p_day, v_units, v_rev, v_onhand)
  ON CONFLICT (tenant_id, tenant_product_id, day)
  DO UPDATE SET
    units_sold = EXCLUDED.units_sold,
    revenue    = EXCLUDED.revenue,
    on_hand    = EXCLUDED.on_hand,
    updated_at = now();
END;
$$;

-- 3b. kpi_category_daily
CREATE OR REPLACE FUNCTION app.refresh_kpi_category_daily(
  p_tenant_id   uuid,
  p_category_id uuid,
  p_day         date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_gmv          numeric(14,2);
  v_units_sold   bigint;
  v_orders_count bigint;
  v_buyers_count bigint;
BEGIN
  SELECT
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE(SUM(oi.qty), 0)::bigint,
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint
  INTO v_gmv, v_units_sold, v_orders_count, v_buyers_count
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND tp.tenant_category_id = p_category_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND o.status NOT IN ('cancelled', 'draft')
    AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day;

  -- Sparse: skip write when there is no activity for this category on this day.
  IF v_orders_count = 0 AND v_gmv = 0 THEN
    DELETE FROM app.kpi_category_daily
    WHERE tenant_id          = p_tenant_id
      AND tenant_category_id = p_category_id
      AND day                = p_day;
    RETURN;
  END IF;

  INSERT INTO app.kpi_category_daily (
    tenant_id, tenant_category_id, day,
    gmv, units_sold, orders_count, buyers_count, updated_at
  )
  VALUES (
    p_tenant_id, p_category_id, p_day,
    v_gmv, v_units_sold, v_orders_count, v_buyers_count, now()
  )
  ON CONFLICT (tenant_id, tenant_category_id, day) DO UPDATE SET
    gmv          = EXCLUDED.gmv,
    units_sold   = EXCLUDED.units_sold,
    orders_count = EXCLUDED.orders_count,
    buyers_count = EXCLUDED.buyers_count,
    updated_at   = EXCLUDED.updated_at;
END;
$$;

-- 3c. kpi_location_daily
CREATE OR REPLACE FUNCTION app.refresh_kpi_location_daily(
  p_tenant_id   uuid,
  p_location_id uuid,
  p_day         date
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  -- Uses a CTE to compute first so we can conditionally delete vs upsert in one statement.
  WITH agg AS (
    SELECT
      COUNT(DISTINCT o.id)::integer       AS orders_count,
      COUNT(DISTINCT o.buyer_id)::integer AS buyers_count,
      COALESCE(SUM(o.total_amount), 0)    AS gmv,
      COALESCE(SUM(oi.qty), 0)::integer   AS items_count
    FROM app.orders o
    LEFT JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
    WHERE o.tenant_id   = p_tenant_id
      AND o.location_id = p_location_id
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day
      AND o.status NOT IN ('cancelled', 'draft')
      AND o.deleted_at IS NULL
  ),
  sparse_delete AS (
    DELETE FROM app.kpi_location_daily
    WHERE tenant_id   = p_tenant_id
      AND location_id = p_location_id
      AND day         = p_day
      AND EXISTS (SELECT 1 FROM agg WHERE orders_count = 0 AND gmv = 0)
    RETURNING 1
  )
  INSERT INTO app.kpi_location_daily (
    tenant_id, location_id, day,
    orders_count, buyers_count, gmv, items_count, updated_at
  )
  SELECT p_tenant_id, p_location_id, p_day,
    a.orders_count, a.buyers_count, a.gmv, a.items_count, now()
  FROM agg a
  WHERE a.orders_count > 0 OR a.gmv > 0
  ON CONFLICT (tenant_id, location_id, day) DO UPDATE SET
    orders_count = EXCLUDED.orders_count,
    buyers_count = EXCLUDED.buyers_count,
    gmv          = EXCLUDED.gmv,
    items_count  = EXCLUDED.items_count,
    updated_at   = EXCLUDED.updated_at;
$$;
