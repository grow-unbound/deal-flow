-- Metrics V2 raw-vs-snapshot reconciliation: app.metrics_buyer_snapshot
-- (per buyer), independently recomputed per the buyer section of
-- app._metrics_refresh_commercial (20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:1341-1462).
-- Large table: one row per (buyer, metric). Filter to MISMATCH/NO_SNAPSHOT
-- client-side if you only want exceptions.
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-buyer.sql

WITH v_today AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today
), raw AS (
  SELECT b.id AS buyer_id, b.tenant_id,
    COALESCE(ir.cnt90,0) AS invoice_count_90d, COALESCE(ir.value90,0) AS invoice_value_90d,
    COALESCE(er.cnt90,0) AS estimate_count_90d, COALESCE(er.value90,0) AS estimate_value_90d,
    COALESCE(orx.cnt90,0) AS order_count_90d, COALESCE(orx.value90,0) AS order_value_90d,
    COALESCE(ir.receivable,0) AS receivable_amount, COALESCE(ir.overdue,0) AS overdue_amount,
    COALESCE(b.credit_limit,0) AS credit_limit,
    GREATEST(COALESCE(b.credit_limit,0) - COALESCE(ir.receivable,0), 0) AS credit_available,
    COALESCE(ir.app_value90,0) AS app_invoice_value_90d, COALESCE(ir.assisted_value90,0) AS assisted_invoice_value_90d
  FROM app.buyers b
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89 AND app.invoice_status_gmv_included(i.status)) AS cnt90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89 AND app.invoice_status_gmv_included(i.status)),0) AS value90,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)),0) AS receivable,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)),0) AS overdue,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89 AND i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)),0) AS app_value90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today.today - 89 AND NOT i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)
        AND EXISTS (SELECT 1 FROM app.orders lo WHERE lo.id = i.order_id AND lo.is_buyer_app_order)),0) AS assisted_value90
    FROM app.invoices i, v_today WHERE i.tenant_id = b.tenant_id AND i.buyer_id = b.id AND i.deleted_at IS NULL
  ) ir ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= v_today.today - 89) AS cnt90,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= v_today.today - 89),0) AS value90
    FROM app.estimates e, v_today WHERE e.tenant_id = b.tenant_id AND e.buyer_id = b.id AND e.deleted_at IS NULL
  ) er ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) >= v_today.today - 89 AND app.order_status_in_flow(o.status)) AS cnt90,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) >= v_today.today - 89 AND app.order_status_in_flow(o.status)),0) AS value90
    FROM app.orders o, v_today WHERE o.tenant_id = b.tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
  ) orx ON true
  WHERE b.deleted_at IS NULL
)
SELECT tenant_id, buyer_id, metric, raw_value, snapshot_value,
  CASE WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value,0) - COALESCE(snapshot_value,0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict
FROM (
  SELECT r.tenant_id, r.buyer_id, unnest(ARRAY[
    'invoice_count_90d','invoice_value_90d','estimate_count_90d','estimate_value_90d',
    'order_count_90d','order_value_90d','receivable_amount','overdue_amount',
    'credit_limit','credit_available','app_invoice_value_90d','assisted_invoice_value_90d'
  ]) AS metric,
  unnest(ARRAY[r.invoice_count_90d::numeric, r.invoice_value_90d, r.estimate_count_90d, r.estimate_value_90d,
    r.order_count_90d, r.order_value_90d, r.receivable_amount, r.overdue_amount,
    r.credit_limit, r.credit_available, r.app_invoice_value_90d, r.assisted_invoice_value_90d]) AS raw_value,
  unnest(ARRAY[s.invoice_count_90d::numeric, s.invoice_value_90d, s.estimate_count_90d, s.estimate_value_90d,
    s.order_count_90d, s.order_value_90d, s.receivable_amount, s.overdue_amount,
    s.credit_limit, s.credit_available, s.app_invoice_value_90d, s.assisted_invoice_value_90d]) AS snapshot_value
  FROM raw r
  LEFT JOIN app.metrics_buyer_snapshot s ON s.tenant_id = r.tenant_id AND s.buyer_id = r.buyer_id AND s.deleted_at IS NULL
) x
ORDER BY (CASE WHEN snapshot_value IS NULL OR ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, buyer_id, metric;
