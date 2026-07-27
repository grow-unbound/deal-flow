-- gmv/units live-joined invoice_items x invoices on every call (mean 3.8s per
-- pg_stat_statements). Caller (categories-landing.ts) always requests the 'last90'
-- period, the same trailing-90d window app.metrics_product_snapshot already maintains --
-- read from there instead. buyers_current has no snapshot equivalent anywhere in the
-- schema; kept as a narrow, bounded live query (only remaining raw-table touch here).
CREATE OR REPLACE FUNCTION app.get_seller_category_landing_page_metrics_v2(p_tenant_id uuid, p_category_ids uuid[], p_current_start date, p_current_end_exclusive date, p_velocity_start date)
 RETURNS TABLE(tenant_category_id uuid, active_sku_count bigint, oos_sku_count bigint, low_stock_sku_count bigint, brand_count bigint, gmv_current numeric, units_current bigint, buyers_current bigint, avg_days_cover numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'app'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '2s'
AS $function$
  WITH requested AS MATERIALIZED (
    SELECT tc.id
    FROM app.tenant_categories tc
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND tc.id = ANY(COALESCE(p_category_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), products AS MATERIALIZED (
    SELECT tp.id, tp.tenant_category_id, tp.tenant_brand_id
    FROM app.tenant_products tp
    JOIN requested r ON r.id = tp.tenant_category_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), inventory_metrics AS MATERIALIZED (
    SELECT
      p.tenant_category_id,
      COUNT(*) AS active_sku_count,
      COUNT(*) FILTER (WHERE COALESCE(mps.out_of_stock, false)) AS oos_sku_count,
      COUNT(*) FILTER (WHERE COALESCE(mps.low_stock, false) AND NOT COALESCE(mps.out_of_stock, false)) AS low_stock_sku_count,
      COUNT(DISTINCT p.tenant_brand_id) AS brand_count,
      ROUND(AVG(mps.days_cover)::numeric, 2) AS avg_days_cover
    FROM products p
    LEFT JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = p.id
      AND mps.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  ), revenue_metrics AS MATERIALIZED (
    SELECT
      p.tenant_category_id,
      COALESCE(SUM(mps.invoice_value_90d), 0) AS gmv_current,
      COALESCE(SUM(mps.invoice_units_90d), 0)::bigint AS units_current
    FROM products p
    JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = p.id
      AND mps.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  ), buyer_metrics AS MATERIALIZED (
    SELECT
      p.tenant_category_id,
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
  )
  SELECT
    r.id,
    COALESCE(im.active_sku_count, 0),
    COALESCE(im.oos_sku_count, 0),
    COALESCE(im.low_stock_sku_count, 0),
    COALESCE(im.brand_count, 0),
    COALESCE(rm.gmv_current, 0),
    COALESCE(rm.units_current, 0),
    COALESCE(bm.buyers_current, 0),
    im.avg_days_cover
  FROM requested r
  LEFT JOIN inventory_metrics im ON im.tenant_category_id = r.id
  LEFT JOIN revenue_metrics rm ON rm.tenant_category_id = r.id
  LEFT JOIN buyer_metrics bm ON bm.tenant_category_id = r.id;
$function$;
