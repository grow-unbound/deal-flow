-- Metrics V2 raw-vs-snapshot reconciliation: app.metrics_tenant_buyer_app_snapshot,
-- independently recomputed per app._metrics_refresh_buyer_app
-- (20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:1838-1935).
--
-- Also validates two live-computed (not snapshot-backed) dashboard KPI tiles
-- from app.get_metrics_v2_buyer_app_dashboard, fixed 20260718131001:
--   customers_submitting_app_demand -- union of buyer-app-flagged orders AND
--     estimates (previously only counted whichever channel was the tenant's
--     "primary demand kind", undercounting any tenant using both channels).
--   repeat_app_customers -- >=2 buyer-app-flagged docs combined across
--     orders + estimates + invoices (previously only counted one doc kind).
-- These two raw CTEs mirror the corrected RPC logic exactly, so a MISMATCH
-- here means the RPC and this script have drifted, not that the RPC is wrong.
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
), demand_customers_raw AS (
  -- Mirrors app.get_metrics_v2_buyer_app_dashboard's corrected
  -- customers_submitting_app_demand: union of buyer-app-flagged orders AND
  -- estimates, independent of the tenant's "primary demand kind".
  SELECT tenant_id, COUNT(DISTINCT buyer_id) AS cnt
  FROM (
    SELECT o.tenant_id, o.buyer_id
    FROM app.orders o, v_today
    WHERE o.deleted_at IS NULL AND o.is_buyer_app_order
      AND app.metric_day_ist(o.order_date, o.created_at) >= v_today.today - 89
    UNION
    SELECT e.tenant_id, e.buyer_id
    FROM app.estimates e, v_today
    WHERE e.deleted_at IS NULL AND e.is_buyer_app_estimate
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_today.today - 89
  ) demand_buyers
  GROUP BY tenant_id
), repeat_customers_raw AS (
  -- Mirrors app.get_metrics_v2_buyer_app_dashboard's corrected
  -- repeat_app_customers: >=2 buyer-app-flagged docs combined across
  -- orders + estimates + invoices within the 90d horizon.
  SELECT tenant_id, COUNT(*) FILTER (WHERE doc_count >= 2) AS cnt
  FROM (
    SELECT buyer_id, tenant_id, COUNT(*) AS doc_count
    FROM (
      SELECT o.tenant_id, o.buyer_id
      FROM app.orders o, v_today
      WHERE o.deleted_at IS NULL AND o.is_buyer_app_order
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_today.today - 89
      UNION ALL
      SELECT e.tenant_id, e.buyer_id
      FROM app.estimates e, v_today
      WHERE e.deleted_at IS NULL AND e.is_buyer_app_estimate
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_today.today - 89
      UNION ALL
      SELECT i.tenant_id, i.buyer_id
      FROM app.invoices i, v_today
      WHERE i.deleted_at IS NULL AND i.is_buyer_app_invoice
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89
    ) docs
    GROUP BY tenant_id, buyer_id
  ) counts
  GROUP BY tenant_id
), dashboard_v2 AS (
  -- Live RPC output per tenant (not snapshot-backed) -- pulls the two
  -- corrected KPI tiles' 'count' field out of the 'metrics' jsonb array.
  SELECT t.id AS tenant_id,
    (item->>'count')::numeric AS value,
    item->>'id' AS metric_id
  FROM app.tenants t
  CROSS JOIN LATERAL jsonb_array_elements(
    app.get_metrics_v2_buyer_app_dashboard(t.id) -> 'metrics'
  ) AS item
  WHERE t.deleted_at IS NULL
    AND item->>'id' IN ('customers_submitting_app_demand', 'repeat_app_customers')
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

  UNION ALL

  SELECT t.id AS tenant_id, 'customers_submitting_app_demand' AS metric,
    COALESCE(r.cnt, 0)::numeric AS raw_value,
    v.value AS snapshot_value
  FROM app.tenants t
  LEFT JOIN demand_customers_raw r ON r.tenant_id = t.id
  LEFT JOIN dashboard_v2 v ON v.tenant_id = t.id AND v.metric_id = 'customers_submitting_app_demand'
  WHERE t.deleted_at IS NULL

  UNION ALL

  SELECT t.id AS tenant_id, 'repeat_app_customers' AS metric,
    COALESCE(r.cnt, 0)::numeric AS raw_value,
    v.value AS snapshot_value
  FROM app.tenants t
  LEFT JOIN repeat_customers_raw r ON r.tenant_id = t.id
  LEFT JOIN dashboard_v2 v ON v.tenant_id = t.id AND v.metric_id = 'repeat_app_customers'
  WHERE t.deleted_at IS NULL
) x
ORDER BY (CASE WHEN snapshot_value IS NULL OR ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, metric;
