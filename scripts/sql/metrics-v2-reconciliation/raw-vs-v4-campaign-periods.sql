-- Metrics V4 reconciliation: campaign QTD view/demand/revenue summaries.

WITH params AS (
  SELECT *
  FROM app.metrics_v4_period_bounds('this_quarter', clock_timestamp())
), raw_campaign AS (
  SELECT
    c.tenant_id,
    c.id AS campaign_id,
    p.grain,
    p.period_start,
    COALESCE(v.view_count, 0)::bigint AS view_count,
    COALESCE(v.viewed_buyer_count, 0)::bigint AS viewed_buyer_count,
    COALESCE(e.estimate_count, 0)::bigint AS estimate_count,
    COALESCE(o.order_count, 0)::bigint AS order_count
  FROM app.campaigns c
  CROSS JOIN params p
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS view_count, COUNT(DISTINCT buyer_id) AS viewed_buyer_count
    FROM app.campaign_views cv
    WHERE cv.tenant_id = c.tenant_id AND cv.campaign_id = c.id AND cv.deleted_at IS NULL
      AND (cv.viewed_at AT TIME ZONE 'Asia/Kolkata')::date >= p.period_start
      AND (cv.viewed_at AT TIME ZONE 'Asia/Kolkata')::date < p.period_end_exclusive
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(status) OR status = 'accepted') AS estimate_count
    FROM app.estimates e
    WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
  ) e ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(status)) AS order_count
    FROM app.orders o
    WHERE o.tenant_id = c.tenant_id AND o.campaign_id = c.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
  ) o ON true
  WHERE c.deleted_at IS NULL
)
SELECT
  r.tenant_id,
  r.campaign_id,
  r.view_count AS raw_view_count,
  COALESCE(s.view_count, 0) AS snap_view_count,
  r.viewed_buyer_count AS raw_viewed_buyer_count,
  COALESCE(s.viewed_buyer_count, 0) AS snap_viewed_buyer_count,
  r.estimate_count + r.order_count AS raw_demand_count,
  COALESCE(s.estimate_count + s.order_count, 0) AS snap_demand_count
FROM raw_campaign r
LEFT JOIN app.metrics_campaign_period_summary s
  ON s.tenant_id = r.tenant_id
 AND s.campaign_id = r.campaign_id
 AND s.grain = r.grain
 AND s.period_start = r.period_start
 AND s.deleted_at IS NULL
WHERE r.view_count <> COALESCE(s.view_count, 0)
   OR r.viewed_buyer_count <> COALESCE(s.viewed_buyer_count, 0)
   OR r.estimate_count + r.order_count <> COALESCE(s.estimate_count + s.order_count, 0)
ORDER BY r.tenant_id, r.campaign_id;
