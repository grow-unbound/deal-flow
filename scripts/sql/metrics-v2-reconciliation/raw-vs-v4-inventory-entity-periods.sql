-- Metrics V4 reconciliation: sparse product/brand/category/warehouse period summaries.
-- Verifies the current-quarter sparse product summary against invoice item raw facts.

WITH params AS (
  SELECT *
  FROM app.metrics_v4_period_bounds('this_quarter', clock_timestamp())
), raw_product AS (
  SELECT
    i.tenant_id,
    ii.tenant_product_id,
    p.grain,
    p.period_start,
    COUNT(DISTINCT i.id)::bigint AS invoice_count,
    COALESCE(SUM(ii.qty), 0)::numeric AS invoice_units,
    COALESCE(SUM(ii.line_total), 0)::numeric AS invoice_value,
    COUNT(DISTINCT i.buyer_id)::bigint AS invoice_buyer_count
  FROM params p
  JOIN app.invoices i
    ON i.deleted_at IS NULL
   AND app.invoice_status_gmv_included(i.status)
   AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
   AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
  JOIN app.invoice_items ii ON ii.invoice_id = i.id AND ii.deleted_at IS NULL
  GROUP BY i.tenant_id, ii.tenant_product_id, p.grain, p.period_start
), snap_product AS (
  SELECT tenant_id, tenant_product_id, grain, period_start, invoice_count, invoice_units, invoice_value, invoice_buyer_count
  FROM app.metrics_product_period_summary
  WHERE deleted_at IS NULL
), diff AS (
  SELECT
    COALESCE(r.tenant_id, s.tenant_id) AS tenant_id,
    COALESCE(r.tenant_product_id, s.tenant_product_id) AS tenant_product_id,
    COALESCE(r.grain, s.grain) AS grain,
    COALESCE(r.period_start, s.period_start) AS period_start,
    COALESCE(r.invoice_count, 0) AS raw_invoice_count,
    COALESCE(s.invoice_count, 0) AS snap_invoice_count,
    COALESCE(r.invoice_units, 0) AS raw_invoice_units,
    COALESCE(s.invoice_units, 0) AS snap_invoice_units,
    COALESCE(r.invoice_value, 0) AS raw_invoice_value,
    COALESCE(s.invoice_value, 0) AS snap_invoice_value,
    COALESCE(r.invoice_buyer_count, 0) AS raw_invoice_buyer_count,
    COALESCE(s.invoice_buyer_count, 0) AS snap_invoice_buyer_count
  FROM raw_product r
  FULL OUTER JOIN snap_product s
    ON s.tenant_id = r.tenant_id
   AND s.tenant_product_id = r.tenant_product_id
   AND s.grain = r.grain
   AND s.period_start = r.period_start
)
SELECT *
FROM diff
WHERE raw_invoice_count <> snap_invoice_count
   OR abs(raw_invoice_units - snap_invoice_units) > 0.01
   OR abs(raw_invoice_value - snap_invoice_value) > 0.01
   OR raw_invoice_buyer_count <> snap_invoice_buyer_count
ORDER BY tenant_id, tenant_product_id;
