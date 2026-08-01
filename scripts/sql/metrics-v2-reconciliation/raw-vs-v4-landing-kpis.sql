-- Metrics V4 reconciliation: landing snapshots should exist for every tenant/page default period.

WITH expected_pages(page_key, period_key) AS (
  VALUES
    ('dashboard', 'this_month'),
    ('estimates', 'this_month'),
    ('orders', 'this_month'),
    ('invoices', 'this_month'),
    ('customers', 'this_quarter'),
    ('products', 'this_quarter'),
    ('buyer_app', 'this_month'),
    ('campaigns', 'this_quarter'),
    ('customer_groups', 'this_quarter'),
    ('price_lists', 'now'),
    ('brands', 'this_month'),
    ('locations', 'this_month'),
    ('warehouses', 'this_quarter'),
    ('categories', 'this_quarter')
), expanded AS (
  SELECT t.id AS tenant_id, e.page_key, e.period_key,
    CASE
      WHEN e.period_key = 'now' THEN (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date
      ELSE b.period_start
    END AS period_start
  FROM app.tenants t
  CROSS JOIN expected_pages e
  LEFT JOIN LATERAL app.metrics_v4_period_bounds(NULLIF(e.period_key, 'now'), clock_timestamp()) b ON e.period_key <> 'now'
  WHERE t.deleted_at IS NULL
)
SELECT e.*
FROM expanded e
LEFT JOIN app.metrics_landing_kpi_snapshot s
  ON s.tenant_id = e.tenant_id
 AND s.page_key = e.page_key
 AND s.period_key = e.period_key
 AND s.period_start = e.period_start
 AND s.scope_kind = 'tenant'
 AND s.scope_id IS NULL
 AND s.deleted_at IS NULL
WHERE s.id IS NULL
   OR jsonb_typeof(s.kpis) <> 'array'
   OR jsonb_array_length(s.kpis) <> 4
ORDER BY e.tenant_id, e.page_key;
