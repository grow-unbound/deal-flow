-- Follow-up to 20260723092742_fix_kpi_callout_calculations.sql: that migration
-- was already applied before a review caught two regressions in it (LIMIT
-- clauses added to top_locations and recently_replenished callouts), so `db
-- push` treats it as already-run and won't reapply the corrected body. This
-- migration redeploys the corrected function definitions (idempotent
-- CREATE OR REPLACE) so the deployed DB matches the fixed migration source.
--
-- Root cause of the regression: V3CalloutPanel.tsx slices callout rows to 2
-- client-side for the collapsed preview (`item.rows.slice(0, 2)`) and expects
-- the FULL row array from the API for the expand-to-side-sheet view — that's
-- what the 20260718121703_metrics_v2_full_callout_lists.sql migration was
-- for. Server-side LIMIT on those two callouts silently broke the side sheet.

-- ─── BUG 1: Locations Landing - Add conversion_90d to KPI output ───────────────
-- Snapshot carries conversion_90d but RPC didn't expose it in KPIs
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
      COUNT(*) FILTER (WHERE lower(status) = 'active')::bigint AS active_locations,
      COALESCE(SUM(outstanding_dues), 0) AS outstanding_dues_total,
      COUNT(*) FILTER (WHERE outstanding_dues > 0)::bigint AS dues_location_count,
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
      'unpaid_invoice_count', invoice_counts.unpaid_invoice_count,
      'total_invoice_count', invoice_counts.total_invoice_count,
      'outstanding_dues_total', totals.outstanding_dues_total,
      'dues_location_count', totals.dues_location_count,
      'open_estimate_count', estimate_counts.open_estimate_count,
      'total_estimate_count', estimate_counts.total_estimate_count,
      'conversion_pct', ROUND(totals.avg_conversion_90d, 1),
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

-- ─── BUG 7: Warehouses Landing - Add LIMIT to recently_replenished callout ─────
CREATE OR REPLACE FUNCTION app.get_seller_warehouses_landing_summary_v2(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH scoped AS MATERIALIZED (
    SELECT
      w.id,
      w.name,
      COALESCE(w.address ->> 'city', '') AS city,
      w.status,
      w.updated_at,
      COALESCE(ws.tracked_skus, 0) AS tracked_skus,
      COALESCE(ws.low_stock_skus, 0) AS low_stock_skus,
      COALESCE(ws.stockout_skus, 0) AS stockout_skus,
      COALESCE(ws.idle_stock_skus, 0) AS idle_stock_skus,
      COALESCE(ws.last_inventory_update, w.updated_at) AS last_updated
    FROM app.warehouses w
    LEFT JOIN app.warehouses_snapshot ws
      ON ws.tenant_id = p_tenant_id
      AND ws.warehouse_id = w.id
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (p_location_ids IS NULL OR w.location_id = ANY(p_location_ids))
  ), totals AS (
    SELECT
      count(*) FILTER (WHERE status = 'active')::bigint AS active_warehouses,
      COALESCE(sum(tracked_skus), 0)::bigint AS tracked_skus,
      count(*) FILTER (WHERE low_stock_skus > 0 OR stockout_skus > 0)::bigint AS low_stock_warehouses,
      COALESCE(sum(idle_stock_skus), 0)::bigint AS idle_stock_skus
    FROM scoped
  ), stock_attention AS (
    SELECT id, name, city, low_stock_skus + stockout_skus AS value
    FROM scoped
    WHERE low_stock_skus > 0 OR stockout_skus > 0
    ORDER BY low_stock_skus + stockout_skus DESC, id
  ), idle_stock AS (
    SELECT id, name, city, idle_stock_skus AS value
    FROM scoped
    WHERE idle_stock_skus > 0
    ORDER BY idle_stock_skus DESC, id
  ), recently_replenished AS (
    SELECT id, name, city, tracked_skus AS value, last_updated
    FROM scoped
    ORDER BY last_updated DESC NULLS LAST, id
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_warehouses', totals.active_warehouses,
      'tracked_skus', totals.tracked_skus,
      'low_stock_warehouses', totals.low_stock_warehouses,
      'idle_stock_skus', totals.idle_stock_skus
    ),
    'callouts', jsonb_build_object(
      'stock_attention', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value
        ) ORDER BY r.value DESC, r.id)
        FROM stock_attention r
      ), '[]'::jsonb),
      'idle_stock', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value
        ) ORDER BY r.value DESC, r.id)
        FROM idle_stock r
      ), '[]'::jsonb),
      'recently_replenished', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value,
          'last_updated', r.last_updated
        ) ORDER BY r.last_updated DESC NULLS LAST, r.id)
        FROM recently_replenished r
      ), '[]'::jsonb)
    )
  )
  FROM totals;
$$;

-- ─── BUG 5: warehouses_snapshot.idle_stock_skus goes stale over time ──────────
-- refresh_warehouses_snapshot() only fires on warehouse/inventory row writes
-- (see triggers in prod_bootstrap). idle_stock_skus depends on
-- "no sale in the last 90 days", a value that drifts purely with elapsed time —
-- a warehouse with no inventory writes for weeks never re-crosses the
-- threshold, so idle_stock_skus reads 0 (or stale) even when SKUs have gone
-- idle. Add a daily freshness sweep, mirroring the buyer-metric-snapshot
-- pattern (app.refresh_all_buyer_metric_snapshots), for every active warehouse.
CREATE OR REPLACE FUNCTION app.refresh_all_warehouses_snapshots() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  warehouse_row RECORD;
BEGIN
  FOR warehouse_row IN
    SELECT id FROM app.warehouses WHERE deleted_at IS NULL
  LOOP
    PERFORM app.refresh_warehouses_snapshot(warehouse_row.id);
  END LOOP;
END;
$$;

ALTER FUNCTION app.refresh_all_warehouses_snapshots() OWNER TO postgres;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname = 'warehouses-snapshot-freshness';

  -- 02:00 IST (20:30 UTC) — free slot between reco-buyer-weekly (02:15) and
  -- reco-assoc-category-fortnightly (02:45) per the schedule in
  -- 20260719061336_reschedule_cron_ist_spacing.sql.
  PERFORM cron.schedule('warehouses-snapshot-freshness', '30 20 * * *', 'SELECT app.refresh_all_warehouses_snapshots()');
END;
$$;

-- ─── BUG 8: Categories - low_stock_sku_count double-counts OOS SKUs ───────────
-- get_seller_category_landing_page_metrics_v2 (per-row table metrics) correctly
-- excludes out-of-stock SKUs from low_stock_sku_count (mutually exclusive
-- buckets, matching the stock_status convention used everywhere else in the
-- app: out_of_stock / low_stock / clear). get_seller_category_landing_summary_v2
-- (KPI strip + stockout_risk callout) instead OR'd out_of_stock into
-- low_stock_sku_count, so the category table's per-row low-stock sum never
-- matches the summary's low_stock_count, and stockout_risk callout rows show
-- inflated low_stock_sku_count that double-counts the same SKUs already in
-- oos_sku_count.
CREATE OR REPLACE FUNCTION app.get_seller_category_landing_summary_v2(
  p_tenant_id uuid,
  p_current_start date,
  p_current_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
  WITH active_categories AS MATERIALIZED (
    SELECT tc.id, tc.name
    FROM app.tenant_categories tc
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND tc.is_active = true
  ), products AS MATERIALIZED (
    SELECT tp.id, tp.tenant_category_id, tp.tenant_brand_id
    FROM app.tenant_products tp
    JOIN active_categories ac ON ac.id = tp.tenant_category_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), stock_by_category AS MATERIALIZED (
    SELECT
      p.tenant_category_id AS id,
      COUNT(*) FILTER (WHERE COALESCE(mps.out_of_stock, false)) AS oos_sku_count,
      COUNT(*) FILTER (WHERE COALESCE(mps.low_stock, false) AND NOT COALESCE(mps.out_of_stock, false)) AS low_stock_sku_count
    FROM products p
    LEFT JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = p.id
      AND mps.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  ), invoice_rollup AS MATERIALIZED (
    SELECT
      p.tenant_category_id AS id,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN ii.line_total ELSE 0 END), 0) AS gmv_current,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_previous_end_exclusive THEN ii.line_total ELSE 0 END), 0) AS gmv_previous,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN ii.qty ELSE 0 END), 0)::bigint AS units_current,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE i.buyer_id IS NOT NULL
          AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
          AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
      ) AS buyers_current
    FROM products p
    LEFT JOIN app.invoice_items ii
      ON ii.tenant_product_id = p.id
      AND ii.deleted_at IS NULL
    LEFT JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
    GROUP BY p.tenant_category_id
  ), totals AS MATERIALIZED (
    SELECT
      COALESCE((SELECT SUM(ir.gmv_current) FROM invoice_rollup ir), 0) AS total_gmv,
      COALESCE((
        SELECT ms.active_category_count
        FROM app.metrics_tenant_setup_snapshot ms
        WHERE ms.tenant_id = p_tenant_id
          AND ms.deleted_at IS NULL
      ), 0) AS active_count,
      COALESCE((
        SELECT COUNT(*)
        FROM active_categories ac
        LEFT JOIN invoice_rollup ir ON ir.id = ac.id
        WHERE COALESCE(ir.gmv_current, 0) = 0
      ), 0) AS uncategorized_count
  ), stockout_risk AS MATERIALIZED (
    SELECT
      ac.id,
      ac.name,
      COALESCE(sb.low_stock_sku_count, 0) AS low_stock_sku_count,
      COALESCE(sb.oos_sku_count, 0) AS oos_sku_count
    FROM active_categories ac
    LEFT JOIN stock_by_category sb ON sb.id = ac.id
    WHERE COALESCE(sb.low_stock_sku_count, 0) > 0 OR COALESCE(sb.oos_sku_count, 0) > 0
    ORDER BY COALESCE(sb.oos_sku_count, 0) DESC, COALESCE(sb.low_stock_sku_count, 0) DESC, ac.name
  ), top_performers AS MATERIALIZED (
    SELECT
      ac.id,
      ac.name,
      COALESCE(ir.gmv_current, 0) AS gmv_current,
      COALESCE(ir.buyers_current, 0) AS buyers_current
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    WHERE COALESCE(ir.gmv_current, 0) > 0
    ORDER BY COALESCE(ir.gmv_current, 0) DESC, ac.name
  ), fast_movers AS MATERIALIZED (
    SELECT
      ac.id,
      ac.name,
      COALESCE(ir.units_current, 0) AS units_current,
      COALESCE(ir.gmv_current, 0) AS gmv_current
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    WHERE COALESCE(ir.units_current, 0) > 0
    ORDER BY COALESCE(ir.units_current, 0) DESC, COALESCE(ir.gmv_current, 0) DESC, ac.name
  ), top_category AS MATERIALIZED (
    SELECT ac.name, COALESCE(ir.gmv_current, 0) AS gmv_current
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    ORDER BY COALESCE(ir.gmv_current, 0) DESC, ac.name
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_count', totals.active_count,
      'low_stock_count', COALESCE((SELECT COUNT(*) FROM stock_by_category sb WHERE COALESCE(sb.low_stock_sku_count, 0) > 0), 0),
      'top_category_name', (SELECT name FROM top_category),
      'top_category_share_pct', CASE WHEN totals.total_gmv > 0 THEN ROUND((COALESCE((SELECT gmv_current FROM top_category), 0) / totals.total_gmv) * 100, 0) ELSE 0 END,
      'uncategorized_count', totals.uncategorized_count
    ),
    'callouts', jsonb_build_object(
      'stockout_risk', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sr.id,
          'name', sr.name,
          'low_stock_sku_count', sr.low_stock_sku_count,
          'oos_sku_count', sr.oos_sku_count
        ) ORDER BY sr.oos_sku_count DESC, sr.low_stock_sku_count DESC, sr.name)
        FROM stockout_risk sr
      ), '[]'::jsonb),
      'top_performers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', tp.id,
          'name', tp.name,
          'gmv_mtd', tp.gmv_current,
          'buyers_count', tp.buyers_current
        ) ORDER BY tp.gmv_current DESC, tp.name)
        FROM top_performers tp
      ), '[]'::jsonb),
      'fast_movers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', fm.id,
          'name', fm.name,
          'units_mtd', fm.units_current,
          'gmv_mtd', fm.gmv_current
        ) ORDER BY fm.units_current DESC, fm.gmv_current DESC, fm.name)
        FROM fast_movers fm
      ), '[]'::jsonb)
    )
  )
  FROM totals;
$$;
