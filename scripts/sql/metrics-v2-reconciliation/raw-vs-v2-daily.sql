-- Metrics V2 raw-vs-snapshot reconciliation: app.metrics_tenant_daily and
-- app.metrics_location_daily, independently recomputed per
-- app._metrics_refresh_commercial's day section (kernel migration:1486-1620)
-- and app._metrics_refresh_location_scopes' location-day section (:997-1099).
-- Checks the trailing 14 days only (daily facts are unbounded in count
-- otherwise, and the plan's own rule is tenant/location-daily is for shipped
-- charts only -- recent days are what those charts show).
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-daily.sql

-- ── metrics_tenant_daily ──
WITH days AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date - gs AS day
  FROM generate_series(0, 13) gs
), raw AS (
  SELECT t.id AS tenant_id, d.day,
    COALESCE(ir.cnt,0) AS invoice_count, COALESCE(ir.value,0) AS invoice_value,
    COALESCE(er.cnt,0) AS estimate_count, COALESCE(er.value,0) AS estimate_value,
    COALESCE(orx.cnt,0) AS order_count, COALESCE(orx.value,0) AS order_value
  FROM app.tenants t
  CROSS JOIN days d
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT i.id) FILTER (WHERE app.invoice_status_gmv_included(i.status)) AS cnt,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)),0) AS value
    FROM app.invoices i WHERE i.tenant_id = t.id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) = d.day
  ) ir ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT e.id) AS cnt, COALESCE(SUM(e.total_amount),0) AS value
    FROM app.estimates e WHERE e.tenant_id = t.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = d.day
  ) er ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT o.id) FILTER (WHERE app.order_status_in_flow(o.status)) AS cnt,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)),0) AS value
    FROM app.orders o WHERE o.tenant_id = t.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = d.day
  ) orx ON true
  WHERE t.deleted_at IS NULL
)
SELECT tenant_id, day, metric, raw_value, snapshot_value,
  CASE WHEN snapshot_value IS NULL AND raw_value = 0 THEN 'MATCH_ZERO_NO_ROW'
       WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value,0) - COALESCE(snapshot_value,0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict
FROM (
  SELECT r.tenant_id, r.day, unnest(ARRAY['invoice_count','invoice_value','estimate_count','estimate_value','order_count','order_value']) AS metric,
    unnest(ARRAY[r.invoice_count::numeric, r.invoice_value, r.estimate_count, r.estimate_value, r.order_count, r.order_value]) AS raw_value,
    unnest(ARRAY[s.invoice_count::numeric, s.invoice_value, s.estimate_count, s.estimate_value, s.order_count, s.order_value]) AS snapshot_value
  FROM raw r
  LEFT JOIN app.metrics_tenant_daily s ON s.tenant_id = r.tenant_id AND s.day = r.day AND s.deleted_at IS NULL
) x
ORDER BY (CASE
    WHEN snapshot_value IS NULL AND raw_value <> 0 THEN 0
    WHEN snapshot_value IS NOT NULL AND ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0
    ELSE 1
  END), tenant_id, day, metric;

-- ── metrics_location_daily ──
WITH days AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date - gs AS day
  FROM generate_series(0, 13) gs
), raw AS (
  SELECT l.id AS location_id, l.tenant_id, d.day,
    COALESCE(ir.cnt,0) AS invoice_count, COALESCE(ir.value,0) AS invoice_value,
    COALESCE(er.cnt,0) AS estimate_count, COALESCE(er.value,0) AS estimate_value,
    COALESCE(orx.cnt,0) AS order_count, COALESCE(orx.value,0) AS order_value
  FROM app.locations l
  CROSS JOIN days d
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT i.id) FILTER (WHERE app.invoice_status_gmv_included(i.status)) AS cnt,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)),0) AS value
    FROM app.invoices i WHERE i.tenant_id = l.tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) = d.day
  ) ir ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT e.id) AS cnt, COALESCE(SUM(e.total_amount),0) AS value
    FROM app.estimates e WHERE e.tenant_id = l.tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = d.day
  ) er ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT o.id) FILTER (WHERE app.order_status_in_flow(o.status)) AS cnt,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)),0) AS value
    FROM app.orders o WHERE o.tenant_id = l.tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = d.day
  ) orx ON true
  WHERE l.tenant_id IN (SELECT id FROM app.tenants WHERE deleted_at IS NULL) AND l.deleted_at IS NULL
)
SELECT tenant_id, location_id, day, metric, raw_value, snapshot_value,
  CASE WHEN snapshot_value IS NULL AND raw_value = 0 THEN 'MATCH_ZERO_NO_ROW'
       WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value,0) - COALESCE(snapshot_value,0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict
FROM (
  SELECT r.tenant_id, r.location_id, r.day, unnest(ARRAY['invoice_count','invoice_value','estimate_count','estimate_value','order_count','order_value']) AS metric,
    unnest(ARRAY[r.invoice_count::numeric, r.invoice_value, r.estimate_count, r.estimate_value, r.order_count, r.order_value]) AS raw_value,
    unnest(ARRAY[s.invoice_count::numeric, s.invoice_value, s.estimate_count, s.estimate_value, s.order_count, s.order_value]) AS snapshot_value
  FROM raw r
  LEFT JOIN app.metrics_location_daily s ON s.tenant_id = r.tenant_id AND s.location_id = r.location_id AND s.day = r.day AND s.deleted_at IS NULL
) x
ORDER BY (CASE
    WHEN snapshot_value IS NULL AND raw_value <> 0 THEN 0
    WHEN snapshot_value IS NOT NULL AND ABS(COALESCE(raw_value,0)-COALESCE(snapshot_value,0)) > 0.01 THEN 0
    ELSE 1
  END), tenant_id, location_id, day, metric;
