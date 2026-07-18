-- Metrics V2 raw-vs-snapshot reconciliation (read-only).
--
-- Recomputes the same aggregates app._metrics_refresh_commercial /
-- app._metrics_refresh_setup write into app.metrics_tenant_commercial_snapshot /
-- app.metrics_tenant_setup_snapshot, independently, straight from raw source
-- tables using the same canonical eligibility helpers (app.invoice_status_gmv_included,
-- app.invoice_status_has_receivable, app.invoice_is_overdue, app.estimate_status_is_open,
-- app.order_status_is_open, app.order_status_in_flow, app.metric_day_ist), then
-- diffs against whatever is currently materialized in the snapshot tables.
--
-- A mismatch here means one of: the refresh function has a bug, the tenant's
-- snapshot is stale because dirty-marking/refresh hasn't caught up yet, or a
-- data change landed between snapshot computation and this query running (a
-- snapshot is a point-in-time read, so a small amount of drift right after a
-- write is expected -- re-run this after the dirty backlog has drained to
-- rule that out before treating a mismatch as a real bug).
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-commercial.sql
--
-- Read-only: no writes, no schema changes. Safe to run repeatedly against any
-- environment the caller has read access to.

WITH v_now AS (
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS today
), tenants AS (
  SELECT t.id AS tenant_id, date_trunc('month', clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS month_start
  FROM app.tenants t
  WHERE t.deleted_at IS NULL
), raw_commercial AS (
  SELECT
    tn.tenant_id,
    (SELECT COUNT(*) FROM app.estimates e WHERE e.tenant_id = tn.tenant_id AND e.deleted_at IS NULL
       AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN tn.month_start AND (SELECT today FROM v_now)) AS raw_estimate_month_count,
    (SELECT COALESCE(SUM(e.total_amount), 0) FROM app.estimates e WHERE e.tenant_id = tn.tenant_id AND e.deleted_at IS NULL
       AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN tn.month_start AND (SELECT today FROM v_now)) AS raw_estimate_month_value,
    (SELECT COUNT(*) FROM app.estimates e WHERE e.tenant_id = tn.tenant_id AND e.deleted_at IS NULL AND app.estimate_status_is_open(e.status)) AS raw_open_estimate_count,
    (SELECT COALESCE(SUM(e.total_amount), 0) FROM app.estimates e WHERE e.tenant_id = tn.tenant_id AND e.deleted_at IS NULL AND app.estimate_status_is_open(e.status)) AS raw_open_estimate_value,
    (SELECT COUNT(*) FROM app.orders o WHERE o.tenant_id = tn.tenant_id AND o.deleted_at IS NULL
       AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN tn.month_start AND (SELECT today FROM v_now) AND app.order_status_in_flow(o.status)) AS raw_order_month_count,
    (SELECT COALESCE(SUM(o.total_amount), 0) FROM app.orders o WHERE o.tenant_id = tn.tenant_id AND o.deleted_at IS NULL
       AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN tn.month_start AND (SELECT today FROM v_now) AND app.order_status_in_flow(o.status)) AS raw_order_month_value,
    (SELECT COUNT(*) FROM app.orders o WHERE o.tenant_id = tn.tenant_id AND o.deleted_at IS NULL AND app.order_status_is_open(o.status)) AS raw_open_order_count,
    (SELECT COALESCE(SUM(o.total_amount), 0) FROM app.orders o WHERE o.tenant_id = tn.tenant_id AND o.deleted_at IS NULL AND app.order_status_is_open(o.status)) AS raw_open_order_value,
    (SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = tn.tenant_id AND i.deleted_at IS NULL
       AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN tn.month_start AND (SELECT today FROM v_now) AND app.invoice_status_gmv_included(i.status)) AS raw_invoice_month_count,
    (SELECT COALESCE(SUM(i.total_amount), 0) FROM app.invoices i WHERE i.tenant_id = tn.tenant_id AND i.deleted_at IS NULL
       AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN tn.month_start AND (SELECT today FROM v_now) AND app.invoice_status_gmv_included(i.status)) AS raw_invoice_month_value,
    (SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = tn.tenant_id AND i.deleted_at IS NULL AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS raw_receivable_count,
    (SELECT COALESCE(SUM(i.outstanding_balance), 0) FROM app.invoices i WHERE i.tenant_id = tn.tenant_id AND i.deleted_at IS NULL AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS raw_receivable_value,
    (SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = tn.tenant_id AND i.deleted_at IS NULL AND app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)) AS raw_overdue_count,
    (SELECT COALESCE(SUM(i.outstanding_balance), 0) FROM app.invoices i WHERE i.tenant_id = tn.tenant_id AND i.deleted_at IS NULL AND app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)) AS raw_overdue_value,
    (SELECT COUNT(*) FROM app.tenant_products tp WHERE tp.tenant_id = tn.tenant_id AND tp.deleted_at IS NULL AND tp.is_active) AS raw_active_product_count
  FROM tenants tn
), snapshot_side AS (
  SELECT
    cs.tenant_id,
    cs.current_month_estimate_count, cs.current_month_estimate_value,
    cs.open_estimate_count, cs.open_estimate_value,
    cs.current_month_order_count, cs.current_month_order_value,
    cs.open_order_count, cs.open_order_value,
    cs.current_month_invoice_count, cs.current_month_invoice_value,
    cs.receivable_invoice_count, cs.receivable_amount,
    cs.overdue_invoice_count, cs.overdue_amount,
    cs.computed_at AS commercial_computed_at,
    ss.active_product_count,
    ss.computed_at AS setup_computed_at
  FROM app.metrics_tenant_commercial_snapshot cs
  LEFT JOIN app.metrics_tenant_setup_snapshot ss ON ss.tenant_id = cs.tenant_id AND ss.deleted_at IS NULL
  WHERE cs.deleted_at IS NULL
), diffed AS (
  SELECT
    r.tenant_id,
    unnest(ARRAY[
      'current_month_estimate_count', 'current_month_estimate_value',
      'open_estimate_count', 'open_estimate_value',
      'current_month_order_count', 'current_month_order_value',
      'open_order_count', 'open_order_value',
      'current_month_invoice_count', 'current_month_invoice_value',
      'receivable_invoice_count', 'receivable_amount',
      'overdue_invoice_count', 'overdue_amount',
      'active_product_count'
    ]) AS metric,
    unnest(ARRAY[
      r.raw_estimate_month_count::numeric, r.raw_estimate_month_value,
      r.raw_open_estimate_count::numeric, r.raw_open_estimate_value,
      r.raw_order_month_count::numeric, r.raw_order_month_value,
      r.raw_open_order_count::numeric, r.raw_open_order_value,
      r.raw_invoice_month_count::numeric, r.raw_invoice_month_value,
      r.raw_receivable_count::numeric, r.raw_receivable_value,
      r.raw_overdue_count::numeric, r.raw_overdue_value,
      r.raw_active_product_count::numeric
    ]) AS raw_value,
    unnest(ARRAY[
      s.current_month_estimate_count::numeric, s.current_month_estimate_value,
      s.open_estimate_count::numeric, s.open_estimate_value,
      s.current_month_order_count::numeric, s.current_month_order_value,
      s.open_order_count::numeric, s.open_order_value,
      s.current_month_invoice_count::numeric, s.current_month_invoice_value,
      s.receivable_invoice_count::numeric, s.receivable_amount,
      s.overdue_invoice_count::numeric, s.overdue_amount,
      s.active_product_count::numeric
    ]) AS snapshot_value,
    s.commercial_computed_at,
    s.setup_computed_at
  FROM raw_commercial r
  LEFT JOIN snapshot_side s ON s.tenant_id = r.tenant_id
)
SELECT
  tenant_id,
  metric,
  raw_value,
  snapshot_value,
  CASE WHEN snapshot_value IS NULL THEN 'NO_SNAPSHOT'
       WHEN ABS(COALESCE(raw_value, 0) - COALESCE(snapshot_value, 0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict,
  ROUND(COALESCE(raw_value, 0) - COALESCE(snapshot_value, 0), 2) AS diff,
  commercial_computed_at,
  setup_computed_at
FROM diffed
ORDER BY (CASE WHEN snapshot_value IS NULL OR ABS(COALESCE(raw_value, 0) - COALESCE(snapshot_value, 0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, metric;
