-- Metrics V4 reconciliation: tenant/location commercial period summaries.
-- Read-only diff from raw commercial documents to app.metrics_*_period_summary.

WITH params AS (
  SELECT *
  FROM app.metrics_v4_period_bounds('this_month', clock_timestamp())
), tenants AS (
  SELECT id AS tenant_id FROM app.tenants WHERE deleted_at IS NULL
), raw_tenant AS (
  SELECT
    t.tenant_id,
    p.grain,
    p.period_start,
    COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
    COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value,
    COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_buyer_count
  FROM tenants t
  CROSS JOIN params p
  LEFT JOIN app.invoices i
    ON i.tenant_id = t.tenant_id
   AND i.deleted_at IS NULL
   AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
   AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
  GROUP BY t.tenant_id, p.grain, p.period_start
), snap_tenant AS (
  SELECT tenant_id, grain, period_start, invoice_count, invoice_value, invoice_buyer_count
  FROM app.metrics_tenant_period_summary
  WHERE deleted_at IS NULL
), diff AS (
  SELECT
    r.tenant_id,
    r.grain,
    r.period_start,
    r.invoice_count AS raw_invoice_count,
    COALESCE(s.invoice_count, 0) AS snap_invoice_count,
    r.invoice_value AS raw_invoice_value,
    COALESCE(s.invoice_value, 0) AS snap_invoice_value,
    r.invoice_buyer_count AS raw_invoice_buyer_count,
    COALESCE(s.invoice_buyer_count, 0) AS snap_invoice_buyer_count
  FROM raw_tenant r
  LEFT JOIN snap_tenant s
    ON s.tenant_id = r.tenant_id
   AND s.grain = r.grain
   AND s.period_start = r.period_start
)
SELECT *
FROM diff
WHERE raw_invoice_count <> snap_invoice_count
   OR abs(raw_invoice_value - snap_invoice_value) > 0.01
   OR raw_invoice_buyer_count <> snap_invoice_buyer_count
UNION ALL
SELECT
  r.tenant_id,
  r.grain,
  r.period_start,
  r.invoice_count AS raw_invoice_count,
  COALESCE(s.invoice_count, 0) AS snap_invoice_count,
  r.invoice_value AS raw_invoice_value,
  COALESCE(s.invoice_value, 0) AS snap_invoice_value,
  r.invoice_buyer_count AS raw_invoice_buyer_count,
  COALESCE(s.invoice_buyer_count, 0) AS snap_invoice_buyer_count
FROM (
  SELECT
    l.tenant_id,
    l.id AS location_id,
    p.grain,
    p.period_start,
    COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
    COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value,
    COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_buyer_count
  FROM app.locations l
  CROSS JOIN params p
  LEFT JOIN app.invoices i
    ON i.tenant_id = l.tenant_id
   AND i.location_id = l.id
   AND i.deleted_at IS NULL
   AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
   AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
  WHERE l.deleted_at IS NULL
  GROUP BY l.tenant_id, l.id, p.grain, p.period_start
) r
LEFT JOIN app.metrics_location_period_summary s
  ON s.tenant_id = r.tenant_id
 AND s.location_id = r.location_id
 AND s.grain = r.grain
 AND s.period_start = r.period_start
 AND s.deleted_at IS NULL
WHERE r.invoice_count <> COALESCE(s.invoice_count, 0)
   OR abs(r.invoice_value - COALESCE(s.invoice_value, 0)) > 0.01
   OR r.invoice_buyer_count <> COALESCE(s.invoice_buyer_count, 0)
ORDER BY tenant_id, grain, period_start;
