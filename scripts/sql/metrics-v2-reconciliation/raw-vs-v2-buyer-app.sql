-- Metrics V2 raw-vs-snapshot reconciliation: app.metrics_tenant_buyer_app_snapshot,
-- independently recomputed per app._metrics_refresh_buyer_app
-- (20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:1838-1935).
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-buyer-app.sql

WITH v_today AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today
), activity AS (
  SELECT t.id AS tenant_id,
    COUNT(DISTINCT a.buyer_id) AS active_count,
    COUNT(DISTINCT a.buyer_id) FILTER (WHERE x.events >= 2) AS repeat_count
  FROM app.tenants t
  LEFT JOIN app.buyer_app_activity a ON a.tenant_id = t.id AND a.deleted_at IS NULL
    AND a.qualifies_for_engagement AND a.occurred_day >= (SELECT today FROM v_today) - 89
  LEFT JOIN (
    SELECT tenant_id, buyer_id, COUNT(*) AS events FROM app.buyer_app_activity
    WHERE deleted_at IS NULL AND qualifies_for_engagement
      AND occurred_day >= (SELECT today FROM v_today) - 89
    GROUP BY tenant_id, buyer_id
  ) x ON x.tenant_id = a.tenant_id AND x.buyer_id = a.buyer_id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id
), estimates_rollup AS (
  SELECT tenant_id, COUNT(*) AS cnt, COALESCE(SUM(total_amount),0) AS value
  FROM app.estimates, v_today
  WHERE deleted_at IS NULL AND is_buyer_app_estimate
    AND app.metric_day_ist(estimate_date, created_at) >= v_today.today - 89
  GROUP BY tenant_id
), orders_rollup AS (
  SELECT tenant_id,
    COUNT(*) FILTER (WHERE app.order_status_in_flow(status)) AS cnt,
    COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)),0) AS value
  FROM app.orders, v_today
  WHERE deleted_at IS NULL AND is_buyer_app_order
    AND app.metric_day_ist(order_date, created_at) >= v_today.today - 89
  GROUP BY tenant_id
), invoices_rollup AS (
  SELECT i.tenant_id,
    COUNT(*) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)) AS app_cnt,
    COALESCE(SUM(i.total_amount) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)),0) AS app_value,
    COUNT(*) FILTER (WHERE NOT i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)
      AND EXISTS (SELECT 1 FROM app.orders o WHERE o.id = i.order_id AND o.is_buyer_app_order)) AS assisted_cnt,
    COALESCE(SUM(i.total_amount) FILTER (WHERE NOT i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)
      AND EXISTS (SELECT 1 FROM app.orders o WHERE o.id = i.order_id AND o.is_buyer_app_order)),0) AS assisted_value
  FROM app.invoices i, v_today
  WHERE i.deleted_at IS NULL AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89
  GROUP BY i.tenant_id
), raw AS (
  SELECT t.id AS tenant_id,
    (SELECT COUNT(*) FROM app.buyers b WHERE b.tenant_id = t.id AND b.deleted_at IS NULL AND b.is_active AND b.buyer_app_enabled) AS enabled_buyer_count,
    COALESCE(a.active_count,0) AS active_buyer_count_90d,
    COALESCE(a.repeat_count,0) AS repeat_buyer_count_90d,
    COALESCE(er.cnt,0) AS app_estimate_count_90d, COALESCE(er.value,0) AS app_estimate_value_90d,
    COALESCE(orx.cnt,0) AS app_order_count_90d, COALESCE(orx.value,0) AS app_order_value_90d,
    COALESCE(ir.app_cnt,0) AS app_invoice_count_90d, COALESCE(ir.app_value,0) AS app_invoice_value_90d,
    COALESCE(ir.assisted_cnt,0) AS assisted_invoice_count_90d, COALESCE(ir.assisted_value,0) AS assisted_invoice_value_90d
  FROM app.tenants t
  LEFT JOIN activity a ON a.tenant_id = t.id
  LEFT JOIN estimates_rollup er ON er.tenant_id = t.id
  LEFT JOIN orders_rollup orx ON orx.tenant_id = t.id
  LEFT JOIN invoices_rollup ir ON ir.tenant_id = t.id
  WHERE t.deleted_at IS NULL
)
SELECT tenant_id, metric, raw_value, snapshot_value,
  CASE WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value,0) - COALESCE(snapshot_value,0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict
FROM (
  SELECT r.tenant_id, unnest(ARRAY[
    'enabled_buyer_count','active_buyer_count_90d','repeat_buyer_count_90d',
    'app_estimate_count_90d','app_estimate_value_90d','app_order_count_90d','app_order_value_90d',
    'app_invoice_count_90d','app_invoice_value_90d','assisted_invoice_count_90d','assisted_invoice_value_90d'
  ]) AS metric,
  unnest(ARRAY[r.enabled_buyer_count::numeric, r.active_buyer_count_90d, r.repeat_buyer_count_90d,
    r.app_estimate_count_90d, r.app_estimate_value_90d, r.app_order_count_90d, r.app_order_value_90d,
    r.app_invoice_count_90d, r.app_invoice_value_90d, r.assisted_invoice_count_90d, r.assisted_invoice_value_90d]) AS raw_value,
  unnest(ARRAY[s.enabled_buyer_count::numeric, s.active_buyer_count_90d, s.repeat_buyer_count_90d,
    s.app_estimate_count_90d, s.app_estimate_value_90d, s.app_order_count_90d, s.app_order_value_90d,
    s.app_invoice_count_90d, s.app_invoice_value_90d, s.assisted_invoice_count_90d, s.assisted_invoice_value_90d]) AS snapshot_value
  FROM raw r
  LEFT JOIN app.metrics_tenant_buyer_app_snapshot s ON s.tenant_id = r.tenant_id AND s.deleted_at IS NULL
) x
ORDER BY (CASE WHEN snapshot_value IS NULL OR ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, metric;
