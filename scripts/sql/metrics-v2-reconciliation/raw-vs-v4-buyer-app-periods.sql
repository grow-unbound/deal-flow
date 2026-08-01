-- Metrics V4 reconciliation: buyer QTD Spend/Demand and buyer-app demand.

WITH params AS (
  SELECT *
  FROM app.metrics_v4_period_bounds('this_quarter', clock_timestamp())
), raw_buyer AS (
  SELECT
    b.tenant_id,
    b.id AS buyer_id,
    p.grain,
    p.period_start,
    COALESCE(inv.invoice_count, 0)::bigint AS invoice_count,
    COALESCE(inv.invoice_value, 0)::numeric AS invoice_value,
    COALESCE(est.app_estimate_count, 0)::bigint + COALESCE(ord.app_order_count, 0)::bigint AS app_demand_count,
    COALESCE(est.app_estimate_value, 0)::numeric + COALESCE(ord.app_order_value, 0)::numeric AS app_demand_value
  FROM app.buyers b
  CROSS JOIN params p
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status)) AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0) AS invoice_value
    FROM app.invoices i
    WHERE i.tenant_id = b.tenant_id AND i.buyer_id = b.id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')) AS app_estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')), 0) AS app_estimate_value
    FROM app.estimates e
    WHERE e.tenant_id = b.tenant_id AND e.buyer_id = b.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)) AS app_order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)), 0) AS app_order_value
    FROM app.orders o
    WHERE o.tenant_id = b.tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
  ) ord ON true
  WHERE b.deleted_at IS NULL
), diff AS (
  SELECT
    r.tenant_id,
    r.buyer_id,
    r.grain,
    r.period_start,
    r.invoice_count AS raw_invoice_count,
    COALESCE(s.invoice_count, 0) AS snap_invoice_count,
    r.invoice_value AS raw_invoice_value,
    COALESCE(s.invoice_value, 0) AS snap_invoice_value,
    r.app_demand_count AS raw_app_demand_count,
    COALESCE(s.app_demand_count, 0) AS snap_app_demand_count,
    r.app_demand_value AS raw_app_demand_value,
    COALESCE(s.app_demand_value, 0) AS snap_app_demand_value
  FROM raw_buyer r
  LEFT JOIN app.metrics_buyer_period_summary s
    ON s.tenant_id = r.tenant_id
   AND s.buyer_id = r.buyer_id
   AND s.grain = r.grain
   AND s.period_start = r.period_start
   AND s.deleted_at IS NULL
  WHERE r.invoice_count > 0 OR r.app_demand_count > 0
)
SELECT *
FROM diff
WHERE raw_invoice_count <> snap_invoice_count
   OR abs(raw_invoice_value - snap_invoice_value) > 0.01
   OR raw_app_demand_count <> snap_app_demand_count
   OR abs(raw_app_demand_value - snap_app_demand_value) > 0.01
ORDER BY tenant_id, buyer_id;
