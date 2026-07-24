-- Fixes two Locations landing bugs from the 2026-07-24 user report
-- (specs/kpi-fix-execution-log.md):
--
-- 1. "Invoiced sales 90D" tile value was computed client-side as
--    filtered.reduce((sum, row) => sum + row.gmv_mtd, 0) over only the
--    currently-loaded/filtered page of location rows — under-reports for any
--    tenant with more locations than fit on one page, and is a raw
--    client-side aggregation rather than a metrics_v2-sourced KPI. The
--    correct trailing-90d total (`totals.total_gmv`, built from
--    app.metrics_location_daily) was already computed server-side in this
--    RPC but never exposed as a KPI field. Fix: expose it as
--    `invoiced_sales_90d`.
--
-- 2. Tile subtext ("N active locations") on 3 unrelated tiles was bound to
--    `kpis.active_locations`, which is 0 for this tenant because all 9
--    locations have status='inactive' (a real data-hygiene fact — see
--    session notes). Using "active" status as the denominator for
--    "Customers who bought" / "Open estimate value" / "Invoiced sales" tiles
--    is semantically wrong regardless of that data-hygiene issue — those
--    tiles care about total location count, not active/inactive status.
--    Fix: expose `total_locations` (COUNT(*), no status filter) as a
--    separate KPI field for those tiles to reference instead.
--
-- Full function body copied from 20260723121903_fix_locations_overdue_kpi_field.sql
-- (current source of truth) with only the `totals` CTE and the final `kpis`
-- jsonb_build_object changed (added total_locations + invoiced_sales_90d).
CREATE OR REPLACE FUNCTION app.get_seller_locations_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_today date,
  p_expiry_end date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
AS $$
  WITH scoped_locations AS MATERIALIZED (
    SELECT l.id, l.name, l.address, COALESCE(l.status, 'active') AS status
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (p_location_ids IS NULL OR l.id = ANY(p_location_ids))
  ), location_rollup AS MATERIALIZED (
    SELECT
      l.id,
      l.name,
      COALESCE(l.address ->> 'city', '') AS city,
      l.status,
      COALESCE(ls.receivable_amount, 0) AS outstanding_dues,
      COALESCE(ls.overdue_amount, 0) AS overdue_amount,
      COALESCE(ls.invoice_count_90d, 0) AS invoice_count_90d,
      COALESCE(ls.open_estimate_count, 0) AS open_estimate_count,
      COALESCE(ls.out_of_stock_product_count, 0) AS oos_sku_count,
      COALESCE(ls.low_stock_product_count, 0) AS low_stock_sku_count,
      COALESCE(ls.purchasing_buyers_90d, 0) AS buyers_count,
      COALESCE(ls.conversion_90d, 0) AS conversion_90d,
      COALESCE(SUM(ld.invoice_value), 0) AS gmv
    FROM scoped_locations l
    LEFT JOIN app.metrics_location_snapshot ls
      ON ls.tenant_id = p_tenant_id
      AND ls.location_id = l.id
      AND ls.deleted_at IS NULL
    LEFT JOIN app.metrics_location_daily ld
      ON ld.tenant_id = p_tenant_id
      AND ld.location_id = l.id
      AND ld.deleted_at IS NULL
      AND ld.day >= p_current_start
      AND ld.day < p_current_end_exclusive
    GROUP BY l.id, l.name, l.address, l.status, ls.receivable_amount, ls.overdue_amount,
      ls.invoice_count_90d, ls.open_estimate_count, ls.out_of_stock_product_count,
      ls.low_stock_product_count, ls.purchasing_buyers_90d, ls.conversion_90d
  ), oldest_due AS MATERIALIZED (
    SELECT
      i.location_id,
      MAX((p_today - (i.due_date AT TIME ZONE 'Asia/Kolkata')::date))::integer AS oldest_unpaid_days
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IN (SELECT id FROM scoped_locations)
      AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      AND i.due_date IS NOT NULL
    GROUP BY i.location_id
  ), top_locations AS MATERIALIZED (
    SELECT lr.*
    FROM location_rollup lr
    WHERE lr.gmv > 0
    ORDER BY lr.gmv DESC, lr.id
  ), invoice_counts AS MATERIALIZED (
    SELECT
      COUNT(*)::bigint AS total_invoice_count,
      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance))::bigint AS unpaid_invoice_count
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IN (SELECT id FROM scoped_locations)
  ), estimate_counts AS MATERIALIZED (
    SELECT
      COUNT(*)::bigint AS total_estimate_count,
      COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status))::bigint AS open_estimate_count
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.location_id IN (SELECT id FROM scoped_locations)
  ), conversion_rows AS MATERIALIZED (
    SELECT e.id, e.estimate_number, e.total_amount, e.expires_at, COALESCE(b.business_name, 'Unknown buyer') AS business_name
    FROM app.estimates e
    JOIN scoped_locations l ON l.id = e.location_id
    LEFT JOIN app.buyers b ON b.id = e.buyer_id AND b.tenant_id = p_tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.expires_at IS NOT NULL
      AND e.expires_at::date >= p_today
      AND e.expires_at::date <= p_expiry_end
      AND app.estimate_status_is_open(e.status)
    ORDER BY e.expires_at, e.id
  ), totals AS MATERIALIZED (
    SELECT
      COUNT(*)::bigint AS total_locations,
      COUNT(*) FILTER (WHERE lower(status) = 'active')::bigint AS active_locations,
      COALESCE(SUM(outstanding_dues), 0) AS outstanding_dues_total,
      COUNT(*) FILTER (WHERE outstanding_dues > 0)::bigint AS dues_location_count,
      COALESCE(SUM(overdue_amount), 0) AS overdue_dues_total,
      COUNT(*) FILTER (WHERE overdue_amount > 0)::bigint AS overdue_location_count,
      COALESCE(SUM(gmv), 0) AS total_gmv,
      COALESCE(AVG(conversion_90d), 0) AS avg_conversion_90d
    FROM location_rollup
  ), top_one AS MATERIALIZED (
    SELECT name, gmv
    FROM location_rollup
    ORDER BY gmv DESC, id
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_locations', totals.active_locations,
      'total_locations', totals.total_locations,
      'unpaid_invoice_count', invoice_counts.unpaid_invoice_count,
      'total_invoice_count', invoice_counts.total_invoice_count,
      'outstanding_dues_total', totals.outstanding_dues_total,
      'dues_location_count', totals.dues_location_count,
      'overdue_dues_total', totals.overdue_dues_total,
      'overdue_location_count', totals.overdue_location_count,
      'open_estimate_count', estimate_counts.open_estimate_count,
      'total_estimate_count', estimate_counts.total_estimate_count,
      'conversion_pct', ROUND(totals.avg_conversion_90d, 1),
      'invoiced_sales_90d', totals.total_gmv,
      'top_location_name', top_one.name,
      'top_location_gmv_share_pct', CASE WHEN totals.total_gmv > 0 THEN ROUND((top_one.gmv / totals.total_gmv) * 100) ELSE 0 END
    ),
    'callouts', jsonb_build_object(
      'conversions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', c.business_name,
          'city', '',
          'initials', upper(left(regexp_replace(c.business_name, '[^[:alnum:]]', '', 'g'), 2)),
          'estimate_number', c.estimate_number,
          'expires_in_days', GREATEST((c.expires_at::date - p_today), 0),
          'total_amount', COALESCE(c.total_amount, 0)
        ) ORDER BY c.expires_at, c.id)
        FROM conversion_rows c
      ), '[]'::jsonb),
      'top_locations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'city', t.city,
          'initials', upper(left(regexp_replace(t.name, '[^[:alnum:]]', '', 'g'), 2)),
          'gmv_mtd', t.gmv,
          'orders_count', 0,
          'buyers_count', t.buyers_count
        ) ORDER BY t.gmv DESC, t.id)
        FROM top_locations t
      ), '[]'::jsonb),
      'collections_overdue', COALESCE((
        SELECT jsonb_agg(row_data ORDER BY outstanding_dues DESC, id)
        FROM (
          SELECT
            lr.id,
            lr.outstanding_dues,
            jsonb_build_object(
              'id', lr.id,
              'name', lr.name,
              'city', lr.city,
              'initials', upper(left(regexp_replace(lr.name, '[^[:alnum:]]', '', 'g'), 2)),
              'outstanding_dues', lr.outstanding_dues,
              'oldest_unpaid_days', COALESCE(od.oldest_unpaid_days, 0)
            ) AS row_data
          FROM location_rollup lr
          LEFT JOIN oldest_due od ON od.location_id = lr.id
          WHERE lr.overdue_amount > 0 AND od.oldest_unpaid_days IS NOT NULL
          ORDER BY lr.outstanding_dues DESC, lr.id
        ) overdue
      ), '[]'::jsonb)
    )
  )
  FROM totals
  CROSS JOIN invoice_counts
  CROSS JOIN estimate_counts
  LEFT JOIN top_one ON true;
$$;
