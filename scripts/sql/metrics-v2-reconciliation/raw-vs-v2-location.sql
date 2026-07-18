-- Metrics V2 raw-vs-snapshot reconciliation: location-dimensioned tables.
-- Covers app.metrics_location_snapshot, app.metrics_buyer_location_snapshot,
-- and app.metrics_product_location_snapshot, independently recomputed per
-- app._metrics_refresh_location_scopes
-- (20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:581-1099).
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-location.sql

-- ── metrics_location_snapshot (one row per location) ──────────────────────
WITH v_today AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today
), raw AS (
  SELECT l.id AS location_id, l.tenant_id,
    COALESCE(inv.cnt90,0) AS invoice_count_90d, COALESCE(inv.value90,0) AS invoice_value_90d,
    COALESCE(inv.buyers90,0) AS purchasing_buyers_90d,
    COALESCE(est.open_count,0) AS open_estimate_count, COALESCE(est.open_value,0) AS open_estimate_value,
    COALESCE(ord.open_count,0) AS open_order_count, COALESCE(ord.open_value,0) AS open_order_value,
    COALESCE(inv.receivable,0) AS receivable_amount, COALESCE(inv.overdue,0) AS overdue_amount,
    COALESCE(stock.warehouse_count,0) AS linked_warehouse_count,
    COALESCE(stock.stocked,0) AS stocked_product_count, COALESCE(stock.low_stock,0) AS low_stock_product_count,
    COALESCE(stock.out_of_stock,0) AS out_of_stock_product_count
  FROM app.locations l
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89 AND app.invoice_status_gmv_included(i.status)) AS cnt90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89 AND app.invoice_status_gmv_included(i.status)),0) AS value90,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89 AND app.invoice_status_gmv_included(i.status)) AS buyers90,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)),0) AS receivable,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)),0) AS overdue
    FROM app.invoices i, v_today WHERE i.tenant_id = l.tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status)) AS open_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status)),0) AS open_value
    FROM app.estimates e WHERE e.tenant_id = l.tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_is_open(o.status)) AS open_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_is_open(o.status)),0) AS open_value
    FROM app.orders o WHERE o.tenant_id = l.tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT w.id) AS warehouse_count,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available,0)-COALESCE(ti.qty_reserved,0) > 0) AS stocked,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available,0)-COALESCE(ti.qty_reserved,0) > 0
        AND COALESCE(ti.qty_available,0)-COALESCE(ti.qty_reserved,0) <= COALESCE(ti.reorder_point,0)) AS low_stock,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available,0)-COALESCE(ti.qty_reserved,0) <= 0) AS out_of_stock
    FROM app.warehouses w LEFT JOIN app.tenant_inventory ti ON ti.warehouse_id = w.id AND ti.deleted_at IS NULL
    WHERE w.tenant_id = l.tenant_id AND w.location_id = l.id AND w.deleted_at IS NULL AND w.status = 'active'
  ) stock ON true
  WHERE l.tenant_id IN (SELECT id FROM app.tenants WHERE deleted_at IS NULL) AND l.deleted_at IS NULL
)
SELECT tenant_id, location_id, metric, raw_value, snapshot_value,
  CASE WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value,0) - COALESCE(snapshot_value,0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict
FROM (
  SELECT r.tenant_id, r.location_id, unnest(ARRAY[
    'invoice_count_90d','invoice_value_90d','purchasing_buyers_90d',
    'open_estimate_count','open_estimate_value','open_order_count','open_order_value',
    'receivable_amount','overdue_amount','linked_warehouse_count',
    'stocked_product_count','low_stock_product_count','out_of_stock_product_count'
  ]) AS metric,
  unnest(ARRAY[r.invoice_count_90d::numeric, r.invoice_value_90d, r.purchasing_buyers_90d,
    r.open_estimate_count, r.open_estimate_value, r.open_order_count, r.open_order_value,
    r.receivable_amount, r.overdue_amount, r.linked_warehouse_count,
    r.stocked_product_count, r.low_stock_product_count, r.out_of_stock_product_count]) AS raw_value,
  unnest(ARRAY[s.invoice_count_90d::numeric, s.invoice_value_90d, s.purchasing_buyers_90d,
    s.open_estimate_count, s.open_estimate_value, s.open_order_count, s.open_order_value,
    s.receivable_amount, s.overdue_amount, s.linked_warehouse_count,
    s.stocked_product_count, s.low_stock_product_count, s.out_of_stock_product_count]) AS snapshot_value
  FROM raw r
  LEFT JOIN app.metrics_location_snapshot s ON s.tenant_id = r.tenant_id AND s.location_id = r.location_id AND s.deleted_at IS NULL
) x
ORDER BY (CASE WHEN snapshot_value IS NULL OR ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, location_id, metric;

-- ── metrics_product_location_snapshot spot-check (sparse table: only rows
-- that exist are checked here; missing rows for an active (product,location)
-- pair with real inventory/sales are a completeness gap, not just a value
-- mismatch, and won't show up as a row below -- cross-check counts separately
-- if needed) ──
SELECT s.tenant_id, s.location_id, s.tenant_product_id,
  s.on_hand AS snap_on_hand, COALESCE(raw_inv.on_hand,0) AS raw_on_hand,
  s.invoice_units_90d AS snap_units_90d, COALESCE(raw_sales.units90,0) AS raw_units_90d,
  CASE WHEN ABS(COALESCE(s.on_hand,0) - COALESCE(raw_inv.on_hand,0)) <= 0.01
        AND ABS(COALESCE(s.invoice_units_90d,0) - COALESCE(raw_sales.units90,0)) <= 0.01
       THEN 'MATCH' ELSE 'MISMATCH' END AS verdict
FROM app.metrics_product_location_snapshot s
LEFT JOIN LATERAL (
  SELECT SUM(ti.qty_available) AS on_hand
  FROM app.tenant_inventory ti JOIN app.warehouses w ON w.id = ti.warehouse_id
  WHERE ti.tenant_product_id = s.tenant_product_id AND w.location_id = s.location_id
    AND w.tenant_id = s.tenant_id AND ti.deleted_at IS NULL AND w.deleted_at IS NULL AND w.status = 'active'
) raw_inv ON true
LEFT JOIN LATERAL (
  SELECT SUM(ii.qty) AS units90
  FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id, (SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today) vt
  WHERE ii.tenant_product_id = s.tenant_product_id AND i.location_id = s.location_id
    AND i.tenant_id = s.tenant_id AND ii.deleted_at IS NULL AND i.deleted_at IS NULL
    AND app.invoice_status_gmv_included(i.status) AND app.metric_day_ist(i.invoice_date, i.created_at) >= vt.today - 89
) raw_sales ON true
WHERE s.deleted_at IS NULL
ORDER BY verdict DESC, s.tenant_id, s.location_id, s.tenant_product_id
LIMIT 500;

-- ── metrics_buyer_location_snapshot spot-check (sparse: only pairs with
-- activity get a row; per app._metrics_refresh_location_scopes:797-878) ──
SELECT s.tenant_id, s.location_id, s.buyer_id,
  s.invoice_count_90d AS snap_invoice_count_90d, COALESCE(raw_ir.cnt90,0) AS raw_invoice_count_90d,
  s.invoice_value_90d AS snap_invoice_value_90d, COALESCE(raw_ir.value90,0) AS raw_invoice_value_90d,
  CASE WHEN ABS(COALESCE(s.invoice_count_90d,0) - COALESCE(raw_ir.cnt90,0)) <= 0.01
        AND ABS(COALESCE(s.invoice_value_90d,0) - COALESCE(raw_ir.value90,0)) <= 0.01
       THEN 'MATCH' ELSE 'MISMATCH' END AS verdict
FROM app.metrics_buyer_location_snapshot s
LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= vt.today - 89 AND app.invoice_status_gmv_included(i.status)) AS cnt90,
    COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= vt.today - 89 AND app.invoice_status_gmv_included(i.status)),0) AS value90
  FROM app.invoices i, (SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today) vt
  WHERE i.tenant_id = s.tenant_id AND i.location_id = s.location_id AND i.buyer_id = s.buyer_id AND i.deleted_at IS NULL
) raw_ir ON true
WHERE s.deleted_at IS NULL
ORDER BY verdict DESC, s.tenant_id, s.location_id, s.buyer_id
LIMIT 500;
