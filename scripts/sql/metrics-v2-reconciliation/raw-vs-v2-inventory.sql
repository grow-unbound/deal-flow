-- Metrics V2 raw-vs-snapshot reconciliation: inventory domain.
-- Covers app.metrics_tenant_inventory_snapshot (tenant-wide) and
-- app.metrics_product_snapshot (per active product), independently
-- recomputed from app.tenant_products / app.tenant_inventory / app.warehouses /
-- app.invoice_items using the exact predicates in app._metrics_refresh_inventory
-- (20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:1612-1836).
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-inventory.sql

WITH v_today AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today
), product_inventory AS (
  SELECT tp.id, tp.tenant_id,
    COALESCE(SUM(COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0)) FILTER (WHERE w.id IS NOT NULL), 0) AS sellable,
    COALESCE(MAX(ti.reorder_point) FILTER (WHERE w.id IS NOT NULL), 0) AS reorder_point
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_inventory ti ON ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
  LEFT JOIN app.warehouses w ON w.id = ti.warehouse_id AND w.tenant_id = tp.tenant_id AND w.deleted_at IS NULL AND w.status = 'active'
  WHERE tp.deleted_at IS NULL AND tp.is_active
  GROUP BY tp.id, tp.tenant_id
), invoice_products AS (
  SELECT DISTINCT i.tenant_id, ii.tenant_product_id
  FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id, v_today
  WHERE i.deleted_at IS NULL AND ii.deleted_at IS NULL
    AND app.invoice_status_gmv_included(i.status)
    AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89
), tenant_inv_raw AS (
  SELECT pi.tenant_id,
    COUNT(*) AS active_product_count,
    COUNT(*) FILTER (WHERE pi.sellable > 0) AS stocked_product_count,
    COUNT(*) FILTER (WHERE pi.sellable > 0 AND pi.sellable <= pi.reorder_point) AS low_stock_product_count,
    COUNT(*) FILTER (WHERE pi.sellable <= 0) AS out_of_stock_product_count,
    COALESCE(SUM(pi.sellable), 0) AS sellable_units,
    COUNT(*) FILTER (WHERE pi.sellable <= 0 AND ip.tenant_product_id IS NOT NULL) AS recent_invoice_stockout_count
  FROM product_inventory pi
  LEFT JOIN invoice_products ip ON ip.tenant_product_id = pi.id AND ip.tenant_id = pi.tenant_id
  GROUP BY pi.tenant_id
)
SELECT tenant_id, metric, raw_value, snapshot_value,
  CASE WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value,0) - COALESCE(snapshot_value,0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict
FROM (
  SELECT r.tenant_id, unnest(ARRAY[
    'active_product_count','stocked_product_count','low_stock_product_count',
    'out_of_stock_product_count','sellable_units','recent_invoice_stockout_count'
  ]) AS metric,
  unnest(ARRAY[r.active_product_count::numeric, r.stocked_product_count, r.low_stock_product_count,
    r.out_of_stock_product_count, r.sellable_units, r.recent_invoice_stockout_count]) AS raw_value,
  unnest(ARRAY[s.active_product_count::numeric, s.stocked_product_count, s.low_stock_product_count,
    s.out_of_stock_product_count, s.sellable_units, s.recent_invoice_stockout_count]) AS snapshot_value
  FROM tenant_inv_raw r
  LEFT JOIN app.metrics_tenant_inventory_snapshot s ON s.tenant_id = r.tenant_id AND s.deleted_at IS NULL
) x
ORDER BY (CASE WHEN snapshot_value IS NULL OR ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, metric;

-- Per-product reconciliation (app.metrics_product_snapshot). Large tables:
-- output is one row per (product, metric); filter to MISMATCH/NO_SNAPSHOT in
-- the client if you only want exceptions.
WITH v_today AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today
), raw_product AS (
  SELECT tp.id, tp.tenant_id,
    COALESCE(inv.on_hand, 0) AS on_hand, COALESCE(inv.reserved, 0) AS reserved,
    COALESCE(inv.on_hand,0) - COALESCE(inv.reserved,0) AS available,
    (COALESCE(inv.on_hand,0) - COALESCE(inv.reserved,0) > 0
      AND COALESCE(inv.on_hand,0) - COALESCE(inv.reserved,0) <= COALESCE(inv.reorder_point,0)) AS low_stock,
    (COALESCE(inv.on_hand,0) - COALESCE(inv.reserved,0) <= 0) AS out_of_stock,
    COALESCE(sales.units90, 0) AS invoice_units_90d,
    COALESCE(sales.value90, 0) AS invoice_value_90d,
    COALESCE(sales.buyers90, 0) AS purchasing_buyers_90d
  FROM app.tenant_products tp
  LEFT JOIN LATERAL (
    SELECT SUM(ti.qty_available) AS on_hand, SUM(ti.qty_reserved) AS reserved, MAX(ti.reorder_point) AS reorder_point
    FROM app.tenant_inventory ti JOIN app.warehouses w ON w.id = ti.warehouse_id
    WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL AND w.tenant_id = tp.tenant_id AND w.deleted_at IS NULL AND w.status = 'active'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT SUM(ii.qty) AS units90, SUM(COALESCE(ii.line_total, ii.qty * ii.unit_price)) AS value90,
      COUNT(DISTINCT i.buyer_id) AS buyers90
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id, v_today
    WHERE ii.tenant_product_id = tp.id AND ii.deleted_at IS NULL AND i.tenant_id = tp.tenant_id AND i.deleted_at IS NULL
      AND app.invoice_status_gmv_included(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89
  ) sales ON true
  WHERE tp.tenant_id IN (SELECT id FROM app.tenants WHERE deleted_at IS NULL)
    AND tp.deleted_at IS NULL
)
SELECT tenant_id, tenant_product_id, metric, raw_value, snapshot_value,
  CASE WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value,0) - COALESCE(snapshot_value,0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict
FROM (
  SELECT r.tenant_id, r.id AS tenant_product_id,
    unnest(ARRAY['on_hand','reserved','available','invoice_units_90d','invoice_value_90d','purchasing_buyers_90d']) AS metric,
    unnest(ARRAY[r.on_hand::numeric, r.reserved, r.available, r.invoice_units_90d, r.invoice_value_90d, r.purchasing_buyers_90d]) AS raw_value,
    unnest(ARRAY[s.on_hand::numeric, s.reserved, s.available, s.invoice_units_90d, s.invoice_value_90d, s.purchasing_buyers_90d]) AS snapshot_value
  FROM raw_product r
  LEFT JOIN app.metrics_product_snapshot s ON s.tenant_id = r.tenant_id AND s.tenant_product_id = r.id AND s.deleted_at IS NULL
) x
ORDER BY (CASE WHEN snapshot_value IS NULL OR ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, tenant_product_id, metric;
