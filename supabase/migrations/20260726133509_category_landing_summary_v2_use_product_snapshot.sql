-- Same fix as category_landing_page_metrics_v2 (mean 2.6s per pg_stat_statements).
-- Also drops gmv_previous: traced every downstream read in this function (totals,
-- top_performers, fast_movers, stockout_risk) and none reference it; no snapshot
-- retains prior-period history either, so it could never be preserved as a live-only
-- field anyway. Pure removal, not a compromise.
CREATE OR REPLACE FUNCTION app.get_seller_category_landing_summary_v2(p_tenant_id uuid, p_current_start date, p_current_end_exclusive date, p_previous_start date, p_previous_end_exclusive date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'app'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '2s'
AS $function$
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
  ), revenue_rollup AS MATERIALIZED (
    SELECT
      p.tenant_category_id AS id,
      COALESCE(SUM(mps.invoice_value_90d), 0) AS gmv_current,
      COALESCE(SUM(mps.invoice_units_90d), 0)::bigint AS units_current
    FROM products p
    JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = p.id
      AND mps.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  ), buyer_rollup AS MATERIALIZED (
    SELECT
      p.tenant_category_id AS id,
      COUNT(DISTINCT i.buyer_id) AS buyers_current
    FROM app.invoice_items ii
    JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
    JOIN products p ON p.id = ii.tenant_product_id
    WHERE ii.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  ), invoice_rollup AS MATERIALIZED (
    SELECT
      rr.id,
      rr.gmv_current,
      rr.units_current,
      COALESCE(br.buyers_current, 0) AS buyers_current
    FROM revenue_rollup rr
    LEFT JOIN buyer_rollup br ON br.id = rr.id
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
$function$;
