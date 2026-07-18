-- Metrics V2 Phase 6 Wave C completion.
--
-- Purpose:
--   * retire live landing-page reads from legacy brand/category/location/warehouse
--     snapshot and high-cardinality daily tables;
--   * keep bounded page contracts intact;
--   * use V2 snapshots where they exist and raw bounded aggregation where they do not.

DROP FUNCTION IF EXISTS app.get_seller_brand_landing_rows(uuid, uuid[], uuid[], date, date, date, date);

CREATE OR REPLACE FUNCTION app.get_seller_brand_landing_rows(
  p_tenant_id uuid,
  p_brand_ids uuid[],
  p_location_ids uuid[],
  p_current_start date,
  p_current_end date,
  p_previous_start date,
  p_previous_end date
)
RETURNS TABLE(id uuid, row_data jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, catalog
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT tb.*
    FROM app.tenant_brands tb
    WHERE tb.tenant_id = p_tenant_id
      AND tb.deleted_at IS NULL
      AND tb.id = ANY(COALESCE(p_brand_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), brand_products AS MATERIALIZED (
    SELECT
      tp.id AS tenant_product_id,
      tp.tenant_brand_id,
      tp.tenant_category_id
    FROM app.tenant_products tp
    JOIN requested r ON r.id = tp.tenant_brand_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), brand_inventory AS MATERIALIZED (
    SELECT
      bp.tenant_brand_id,
      COUNT(*) FILTER (WHERE mps.low_stock) AS low_stock_products
    FROM brand_products bp
    LEFT JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = bp.tenant_product_id
      AND mps.deleted_at IS NULL
    GROUP BY bp.tenant_brand_id
  ), brand_categories AS MATERIALIZED (
    SELECT
      bp.tenant_brand_id,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT tc.name ORDER BY tc.name), NULL) AS categories
    FROM brand_products bp
    LEFT JOIN app.tenant_categories tc
      ON tc.id = bp.tenant_category_id
      AND tc.deleted_at IS NULL
    GROUP BY bp.tenant_brand_id
  ), period_invoices AS MATERIALIZED (
    SELECT
      tp.tenant_brand_id,
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end THEN COALESCE(ii.line_total, 0) ELSE 0 END) AS gmv_current,
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_previous_end THEN COALESCE(ii.line_total, 0) ELSE 0 END) AS gmv_previous,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE i.buyer_id IS NOT NULL
          AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
          AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end
      ) AS active_buyers_current,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE i.buyer_id IS NOT NULL) AS total_buyers
    FROM app.invoice_items ii
    JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end
      AND (p_location_ids IS NULL OR i.location_id = ANY(p_location_ids))
    JOIN app.tenant_products tp
      ON tp.id = ii.tenant_product_id
      AND tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
    JOIN requested r ON r.id = tp.tenant_brand_id
    WHERE ii.deleted_at IS NULL
    GROUP BY tp.tenant_brand_id
  ), totals AS MATERIALIZED (
    SELECT COALESCE(SUM(pi.gmv_current), 0) AS total_gmv_current
    FROM period_invoices pi
  )
  SELECT
    r.id,
    jsonb_build_object(
      'id', r.id,
      'tenant_id', r.tenant_id,
      'master_brand_id', r.master_brand_id,
      'display_name_override', r.display_name_override,
      'slug', r.slug,
      'description', COALESCE(r.description, r.description_override),
      'logo_url', COALESCE(r.logo_url, r.logo_url_override),
      'margin_pct', r.margin_pct,
      'exclusivity', r.exclusivity,
      'is_active', r.is_active,
      'external_ref', r.external_ref,
      'principal_name', r.principal_name,
      'principal_email', r.principal_email,
      'principal_phone', r.principal_phone,
      'principal_location', r.principal_location,
      'contact_name', r.contact_name,
      'contact_email', r.contact_email,
      'contact_phone', r.contact_phone,
      'default_cohort_id', r.default_cohort_id,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'master_brand', CASE
        WHEN cb.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', cb.id,
          'name', cb.name,
          'slug', cb.slug,
          'logo_url', cb.logo_url,
          'description', cb.description
        )
      END,
      'gmv_mtd', COALESCE(pi.gmv_current, 0),
      'gmv_prev_mtd', COALESCE(pi.gmv_previous, 0),
      'growth_pct', CASE
        WHEN COALESCE(pi.gmv_previous, 0) > 0 THEN ROUND(((COALESCE(pi.gmv_current, 0) - pi.gmv_previous) / pi.gmv_previous) * 100)
        ELSE 0
      END,
      'portfolio_share_pct', CASE
        WHEN totals.total_gmv_current > 0 THEN ROUND((COALESCE(pi.gmv_current, 0) / totals.total_gmv_current) * 100)
        ELSE 0
      END,
      'sku_count', COALESCE((SELECT COUNT(*) FROM brand_products bp WHERE bp.tenant_brand_id = r.id), 0),
      'active_buyers_mtd', COALESCE(pi.active_buyers_current, 0),
      'total_buyers', COALESCE(pi.total_buyers, 0),
      'catalog_days_ago', NULL,
      'categories', COALESCE(to_jsonb(bc.categories), '[]'::jsonb),
      'catalog_name', NULL,
      'alerts', CASE
        WHEN COALESCE(bi.low_stock_products, 0) > 0 THEN to_jsonb(ARRAY['low_stock_risk'])
        ELSE '[]'::jsonb
      END
    )
  FROM requested r
  LEFT JOIN catalog.brands cb ON cb.id = r.master_brand_id
  LEFT JOIN brand_categories bc ON bc.tenant_brand_id = r.id
  LEFT JOIN brand_inventory bi ON bi.tenant_brand_id = r.id
  LEFT JOIN period_invoices pi ON pi.tenant_brand_id = r.id
  CROSS JOIN totals;
$$;

DROP FUNCTION IF EXISTS app.get_seller_brand_landing_summary(uuid, uuid[], date, date, date, date);

CREATE OR REPLACE FUNCTION app.get_seller_brand_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end date,
  p_previous_start date,
  p_previous_end date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
  WITH scoped_brands AS MATERIALIZED (
    SELECT tb.id, tb.display_name_override, tb.master_brand_id
    FROM app.tenant_brands tb
    WHERE tb.tenant_id = p_tenant_id
      AND tb.deleted_at IS NULL
      AND tb.is_active = true
  ), brand_products AS MATERIALIZED (
    SELECT tp.id, tp.tenant_brand_id, tp.tenant_category_id
    FROM app.tenant_products tp
    JOIN scoped_brands sb ON sb.id = tp.tenant_brand_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), brand_rollup AS MATERIALIZED (
    SELECT
      bp.tenant_brand_id,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end THEN ii.line_total ELSE 0 END), 0) AS gmv_current,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_previous_end THEN ii.line_total ELSE 0 END), 0) AS gmv_previous,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE i.buyer_id IS NOT NULL
          AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
          AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end
      ) AS buyers_current
    FROM brand_products bp
    LEFT JOIN app.invoice_items ii
      ON ii.tenant_product_id = bp.id
      AND ii.deleted_at IS NULL
    LEFT JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end
      AND (p_location_ids IS NULL OR i.location_id = ANY(p_location_ids))
    GROUP BY bp.tenant_brand_id
  ), low_stock_brands AS MATERIALIZED (
    SELECT bp.tenant_brand_id
    FROM brand_products bp
    JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = bp.id
      AND mps.deleted_at IS NULL
      AND (mps.low_stock OR mps.out_of_stock)
    GROUP BY bp.tenant_brand_id
  ), categories AS MATERIALIZED (
    SELECT ARRAY_REMOVE(ARRAY_AGG(DISTINCT tc.name ORDER BY tc.name), NULL) AS names
    FROM brand_products bp
    LEFT JOIN app.tenant_categories tc
      ON tc.id = bp.tenant_category_id
      AND tc.deleted_at IS NULL
  ), top_performers AS MATERIALIZED (
    SELECT
      sb.id,
      COALESCE(sb.display_name_override, 'Unnamed brand') AS name,
      COALESCE(br.gmv_current, 0) AS gmv_mtd,
      COALESCE(br.buyers_current, 0) AS buyers_count
    FROM scoped_brands sb
    LEFT JOIN brand_rollup br ON br.tenant_brand_id = sb.id
    WHERE COALESCE(br.gmv_current, 0) > 0
    ORDER BY COALESCE(br.gmv_current, 0) DESC, sb.id
    LIMIT 3
  ), top_risers AS MATERIALIZED (
    SELECT
      sb.id,
      COALESCE(sb.display_name_override, 'Unnamed brand') AS name,
      ROUND(
        CASE
          WHEN COALESCE(br.gmv_previous, 0) > 0 THEN ((COALESCE(br.gmv_current, 0) - br.gmv_previous) / br.gmv_previous) * 100
          ELSE 0
        END
      ) AS growth_pct,
      COALESCE(br.gmv_mtd, COALESCE(br.gmv_current, 0)) AS gmv_mtd
    FROM scoped_brands sb
    LEFT JOIN (
      SELECT tenant_brand_id, gmv_current, gmv_previous, gmv_current AS gmv_mtd
      FROM brand_rollup
    ) br ON br.tenant_brand_id = sb.id
    WHERE COALESCE(br.gmv_current, 0) > 0
    ORDER BY growth_pct DESC, gmv_mtd DESC, sb.id
    LIMIT 3
  ), cohorts AS MATERIALIZED (
    SELECT c.id, c.name
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
    ORDER BY c.name
  ), totals AS MATERIALIZED (
    SELECT
      COALESCE(SUM(br.gmv_current), 0) AS portfolio_gmv_mtd,
      COALESCE(SUM(br.gmv_previous), 0) AS portfolio_gmv_prev_mtd,
      COALESCE(SUM(br.buyers_current), 0) AS buyers_with_orders_mtd,
      (SELECT COUNT(*) FROM app.buyers b WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL) AS total_buyers,
      (SELECT COUNT(*) FROM low_stock_brands) AS need_attention_count
    FROM brand_rollup br
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'portfolio_gmv_mtd', totals.portfolio_gmv_mtd,
      'portfolio_gmv_prev_mtd', totals.portfolio_gmv_prev_mtd,
      'brands_carried', COALESCE(ms.active_brand_count, (SELECT COUNT(*) FROM scoped_brands)),
      'buyers_with_orders_mtd', totals.buyers_with_orders_mtd,
      'total_buyers', totals.total_buyers,
      'need_attention_count', totals.need_attention_count,
      'catalog_freshness_count', 0,
      'total_campaigns', COALESCE(ms.active_campaign_count, 0),
      'catalog_freshness_earliest_days', NULL
    ),
    'todays_read', jsonb_build_object(
      'needs_attention', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sb.id, 'name', COALESCE(sb.display_name_override, 'Unnamed brand')) ORDER BY sb.id)
        FROM scoped_brands sb
        JOIN low_stock_brands lb ON lb.tenant_brand_id = sb.id
      ), '[]'::jsonb),
      'top_performers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', tp.id, 'name', tp.name, 'gmv_mtd', tp.gmv_mtd, 'buyers_count', tp.buyers_count) ORDER BY tp.gmv_mtd DESC, tp.id)
        FROM top_performers tp
      ), '[]'::jsonb),
      'top_risers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', tr.id, 'name', tr.name, 'growth_pct', tr.growth_pct, 'gmv_mtd', tr.gmv_mtd) ORDER BY tr.growth_pct DESC, tr.id)
        FROM top_risers tr
      ), '[]'::jsonb)
    ),
    'categories', COALESCE(to_jsonb(categories.names), '[]'::jsonb),
    'cohorts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
      FROM cohorts c
    ), '[]'::jsonb)
  )
  FROM totals
  LEFT JOIN app.metrics_tenant_setup_snapshot ms
    ON ms.tenant_id = p_tenant_id
    AND ms.deleted_at IS NULL
  CROSS JOIN categories;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_category_landing_page_metrics_v1(
  p_tenant_id uuid,
  p_category_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date,
  p_velocity_start date
)
RETURNS TABLE(
  tenant_category_id uuid,
  active_sku_count bigint,
  oos_sku_count bigint,
  low_stock_sku_count bigint,
  brand_count bigint,
  gmv_current numeric,
  gmv_previous numeric,
  units_current bigint,
  buyers_current bigint,
  avg_days_cover numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
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
  ), invoice_metrics AS MATERIALIZED (
    SELECT
      p.tenant_category_id,
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN COALESCE(ii.line_total, 0) ELSE 0 END) AS gmv_current,
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_previous_end_exclusive THEN COALESCE(ii.line_total, 0) ELSE 0 END) AS gmv_previous,
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN COALESCE(ii.qty, 0) ELSE 0 END)::bigint AS units_current,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE i.buyer_id IS NOT NULL
          AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
          AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
      ) AS buyers_current
    FROM app.invoice_items ii
    JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start
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
    COALESCE(vm.gmv_current, 0),
    COALESCE(vm.gmv_previous, 0),
    COALESCE(vm.units_current, 0),
    COALESCE(vm.buyers_current, 0),
    im.avg_days_cover
  FROM requested r
  LEFT JOIN inventory_metrics im ON im.tenant_category_id = r.id
  LEFT JOIN invoice_metrics vm ON vm.tenant_category_id = r.id;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_category_landing_summary_v1(
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
      COUNT(*) FILTER (WHERE COALESCE(mps.low_stock, false) OR COALESCE(mps.out_of_stock, false)) AS low_stock_sku_count
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
        LIMIT 1
      ), (SELECT COUNT(*) FROM active_categories)) AS active_count,
      COALESCE((SELECT COUNT(*) FROM stock_by_category sbc WHERE COALESCE(sbc.low_stock_sku_count, 0) > 0), 0) AS low_stock_count,
      (
        SELECT COUNT(*)
        FROM app.tenant_products tp
        WHERE tp.tenant_id = p_tenant_id
          AND tp.deleted_at IS NULL
          AND tp.is_active = true
          AND tp.tenant_category_id IS NULL
      ) AS uncategorized_count
  ), top_category AS MATERIALIZED (
    SELECT ac.id, ac.name, COALESCE(ir.gmv_current, 0) AS gmv_current
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    ORDER BY COALESCE(ir.gmv_current, 0) DESC, ac.name, ac.id
    LIMIT 1
  ), stockout_risk AS MATERIALIZED (
    SELECT ac.id, ac.name, COALESCE(sbc.oos_sku_count, 0) AS oos_sku_count, COALESCE(sbc.low_stock_sku_count, 0) AS low_stock_sku_count
    FROM active_categories ac
    JOIN stock_by_category sbc ON sbc.id = ac.id
    WHERE COALESCE(sbc.oos_sku_count, 0) > 0
    ORDER BY COALESCE(sbc.oos_sku_count, 0) DESC, COALESCE(sbc.low_stock_sku_count, 0) DESC, ac.id
    LIMIT 3
  ), top_performers AS MATERIALIZED (
    SELECT ac.id, ac.name, COALESCE(ir.gmv_current, 0) AS gmv_mtd,
      CASE WHEN COALESCE(ir.gmv_previous, 0) > 0 THEN ROUND(((ir.gmv_current - ir.gmv_previous) / ir.gmv_previous) * 100) ELSE 0 END AS growth_pct,
      COALESCE(ir.buyers_current, 0) AS buyers_count
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    WHERE COALESCE(ir.gmv_current, 0) > 0
    ORDER BY COALESCE(ir.gmv_current, 0) DESC, ac.id
    LIMIT 2
  ), fast_movers AS MATERIALIZED (
    SELECT ac.id, ac.name, COALESCE(ir.units_current, 0) AS units_mtd,
      CASE WHEN COALESCE(ir.gmv_previous, 0) > 0 THEN ROUND(((ir.gmv_current - ir.gmv_previous) / ir.gmv_previous) * 100) ELSE 0 END AS growth_pct
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    WHERE COALESCE(ir.units_current, 0) > 0
    ORDER BY COALESCE(ir.units_current, 0) DESC, ac.id
    LIMIT 2
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_count', COALESCE((SELECT active_count FROM totals LIMIT 1), (SELECT COUNT(*) FROM active_categories)),
      'low_stock_count', COALESCE((SELECT low_stock_count FROM totals LIMIT 1), 0),
      'top_category_name', (SELECT name FROM top_category),
      'top_category_share_pct', CASE
        WHEN COALESCE((SELECT total_gmv FROM totals LIMIT 1), 0) > 0
          THEN ROUND(((SELECT gmv_current FROM top_category) / (SELECT total_gmv FROM totals LIMIT 1)) * 100)
        ELSE 0
      END,
      'uncategorized_count', COALESCE((SELECT uncategorized_count FROM totals LIMIT 1), 0)
    ),
    'callouts', jsonb_build_object(
      'stockout_risk', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sr.id, 'name', sr.name, 'oos_sku_count', sr.oos_sku_count, 'low_stock_sku_count', sr.low_stock_sku_count) ORDER BY sr.oos_sku_count DESC, sr.id)
        FROM stockout_risk sr
      ), '[]'::jsonb),
      'top_performers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', tp.id, 'name', tp.name, 'gmv_mtd', tp.gmv_mtd, 'growth_pct', tp.growth_pct, 'buyers_count', tp.buyers_count) ORDER BY tp.gmv_mtd DESC, tp.id)
        FROM top_performers tp
      ), '[]'::jsonb),
      'fast_movers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', fm.id, 'name', fm.name, 'units_mtd', fm.units_mtd, 'growth_pct', fm.growth_pct) ORDER BY fm.units_mtd DESC, fm.id)
        FROM fast_movers fm
      ), '[]'::jsonb)
    )
  );
$$;

CREATE OR REPLACE FUNCTION app.search_seller_location_landing_ids(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_stock_modes text[] DEFAULT NULL,
  p_dues_modes text[] DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_prefix_text text;
  v_statuses text[] := ARRAY(SELECT lower(btrim(value)) FROM unnest(COALESCE(p_statuses, ARRAY[]::text[])) AS value WHERE lower(btrim(value)) IN ('active', 'inactive'));
  v_stock text[] := COALESCE(p_stock_modes, ARRAY[]::text[]);
  v_dues text[] := COALESCE(p_dues_modes, ARRAY[]::text[]);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'p_tenant_id is required'; END IF;
  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);
    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
    IF v_prefix_text IS NOT NULL THEN v_prefix_ts_query := to_tsquery('english', v_prefix_text); END IF;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT
      l.id,
      CASE WHEN v_query IS NULL THEN 0::real ELSE GREATEST(
        ts_rank_cd(l.search_vector, v_ts_query), COALESCE(ts_rank_cd(l.search_vector, v_prefix_ts_query), 0)
      ) END AS search_rank,
      l.created_at
    FROM app.locations l
    LEFT JOIN app.metrics_location_snapshot ls ON ls.location_id = l.id AND ls.tenant_id = p_tenant_id AND ls.deleted_at IS NULL
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (p_location_ids IS NULL OR l.id = ANY(p_location_ids))
      AND (cardinality(v_statuses) = 0 OR lower(COALESCE(l.status, 'active')) = ANY(v_statuses))
      AND (v_query IS NULL OR l.search_vector @@ v_ts_query OR l.search_vector @@ v_prefix_ts_query)
      AND (
        cardinality(v_stock) = 0 OR cardinality(v_stock) >= 3
        OR ('In Stock' = ANY(v_stock) AND COALESCE(ls.out_of_stock_product_count, 0) = 0 AND COALESCE(ls.low_stock_product_count, 0) = 0)
        OR ('Low Stock' = ANY(v_stock) AND COALESCE(ls.out_of_stock_product_count, 0) = 0 AND COALESCE(ls.low_stock_product_count, 0) > 0)
        OR ('Out of Stock' = ANY(v_stock) AND COALESCE(ls.out_of_stock_product_count, 0) > 0)
      )
      AND (
        cardinality(v_dues) = 0
        OR ('Due' = ANY(v_dues) AND COALESCE(ls.receivable_amount, 0) > 0)
        OR ('Overdue' = ANY(v_dues) AND COALESCE(ls.overdue_amount, 0) > 0)
      )
  ), totals AS MATERIALIZED (
    SELECT count(*) AS total_count FROM candidates
  ), page AS MATERIALIZED (
    SELECT candidates.id, candidates.search_rank, candidates.created_at
    FROM candidates
    ORDER BY candidates.search_rank DESC, candidates.created_at, candidates.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT page.id, totals.total_count
  FROM totals
  LEFT JOIN page ON true
  ORDER BY page.search_rank DESC, page.created_at, page.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_location_landing_row_metrics(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date
)
RETURNS TABLE(
  location_id uuid,
  sku_count bigint,
  oos_sku_count bigint,
  low_stock_sku_count bigint,
  outstanding_dues numeric,
  oldest_unpaid_days integer,
  gmv_current numeric,
  gmv_previous numeric,
  active_buyers bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT l.id
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND l.id = ANY(COALESCE(p_location_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), due_age AS MATERIALIZED (
    SELECT
      i.location_id,
      MAX(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - (i.due_date AT TIME ZONE 'Asia/Kolkata')::date))::integer AS oldest_unpaid_days
    FROM app.invoices i
    JOIN requested r ON r.id = i.location_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      AND i.due_date IS NOT NULL
    GROUP BY i.location_id
  ), sales AS MATERIALIZED (
    SELECT
      ld.location_id,
      COALESCE(SUM(ld.invoice_value) FILTER (WHERE ld.day >= p_current_start AND ld.day < p_current_end_exclusive), 0) AS gmv_current,
      COALESCE(SUM(ld.invoice_value) FILTER (WHERE ld.day >= p_previous_start AND ld.day < p_previous_end_exclusive), 0) AS gmv_previous
    FROM app.metrics_location_daily ld
    JOIN requested r ON r.id = ld.location_id
    WHERE ld.tenant_id = p_tenant_id
      AND ld.deleted_at IS NULL
      AND ld.day >= p_previous_start
      AND ld.day < p_current_end_exclusive
    GROUP BY ld.location_id
  )
  SELECT
    r.id,
    COALESCE(ls.stocked_product_count, 0),
    COALESCE(ls.out_of_stock_product_count, 0),
    COALESCE(ls.low_stock_product_count, 0),
    COALESCE(ls.receivable_amount, 0),
    da.oldest_unpaid_days,
    COALESCE(s.gmv_current, 0),
    COALESCE(s.gmv_previous, 0),
    COALESCE(ls.purchasing_buyers_90d, 0)
  FROM requested r
  LEFT JOIN app.metrics_location_snapshot ls
    ON ls.tenant_id = p_tenant_id
    AND ls.location_id = r.id
    AND ls.deleted_at IS NULL
  LEFT JOIN due_age da ON da.location_id = r.id
  LEFT JOIN sales s ON s.location_id = r.id;
$$;

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
      ls.low_stock_product_count, ls.purchasing_buyers_90d
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
    LIMIT 2
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
    LIMIT 3
  ), totals AS MATERIALIZED (
    SELECT
      COUNT(*) FILTER (WHERE lower(status) = 'active')::bigint AS active_locations,
      COALESCE(SUM(outstanding_dues), 0) AS outstanding_dues_total,
      COUNT(*) FILTER (WHERE outstanding_dues > 0)::bigint AS dues_location_count,
      COALESCE(SUM(gmv), 0) AS total_gmv
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
              'oldest_unpaid_days', od.oldest_unpaid_days
            ) AS row_data
          FROM location_rollup lr
          JOIN oldest_due od ON od.location_id = lr.id
          WHERE lr.overdue_amount > 0
          ORDER BY lr.outstanding_dues DESC, lr.id
          LIMIT 3
        ) overdue
      ), '[]'::jsonb)
    )
  )
  FROM totals
  CROSS JOIN invoice_counts
  CROSS JOIN estimate_counts
  LEFT JOIN top_one ON true;
$$;

CREATE OR REPLACE FUNCTION app.search_seller_warehouse_landing_ids(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_stock_modes text[] DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_prefix_text text;
  v_statuses text[] := ARRAY(SELECT lower(btrim(value)) FROM unnest(COALESCE(p_statuses, ARRAY[]::text[])) AS value WHERE lower(btrim(value)) IN ('active', 'inactive'));
  v_stock text[] := COALESCE(p_stock_modes, ARRAY[]::text[]);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'p_tenant_id is required'; END IF;
  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);
    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
    IF v_prefix_text IS NOT NULL THEN v_prefix_ts_query := to_tsquery('english', v_prefix_text); END IF;
  END IF;

  RETURN QUERY
  WITH inventory_rollup AS MATERIALIZED (
    SELECT
      ti.warehouse_id,
      COUNT(DISTINCT ti.tenant_product_id) AS tracked_skus,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available, 0) <= 0) AS stockout_skus,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (
        WHERE COALESCE(ti.qty_available, 0) > 0
          AND ti.reorder_point IS NOT NULL
          AND COALESCE(ti.qty_available, 0) <= ti.reorder_point
      ) AS low_stock_skus
    FROM app.tenant_inventory ti
    JOIN app.warehouses w
      ON w.id = ti.warehouse_id
      AND w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
    WHERE ti.deleted_at IS NULL
    GROUP BY ti.warehouse_id
  ), candidates AS MATERIALIZED (
    SELECT
      w.id,
      CASE WHEN v_query IS NULL THEN 0::real ELSE GREATEST(
        ts_rank_cd(w.search_vector, v_ts_query), COALESCE(ts_rank_cd(w.search_vector, v_prefix_ts_query), 0)
      ) END AS search_rank,
      w.is_default,
      w.created_at
    FROM app.warehouses w
    LEFT JOIN inventory_rollup ir ON ir.warehouse_id = w.id
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (p_location_ids IS NULL OR w.location_id = ANY(p_location_ids))
      AND (cardinality(v_statuses) = 0 OR lower(w.status) = ANY(v_statuses))
      AND (v_query IS NULL OR w.search_vector @@ v_ts_query OR w.search_vector @@ v_prefix_ts_query)
      AND (
        cardinality(v_stock) = 0 OR cardinality(v_stock) >= 3
        OR ('In Stock' = ANY(v_stock) AND COALESCE(ir.stockout_skus, 0) = 0 AND COALESCE(ir.low_stock_skus, 0) = 0)
        OR ('Low Stock' = ANY(v_stock) AND COALESCE(ir.stockout_skus, 0) = 0 AND COALESCE(ir.low_stock_skus, 0) > 0)
        OR ('Out of Stock' = ANY(v_stock) AND COALESCE(ir.stockout_skus, 0) > 0)
      )
  ), totals AS MATERIALIZED (
    SELECT count(*) AS total_count FROM candidates
  ), page AS MATERIALIZED (
    SELECT candidates.id, candidates.search_rank, candidates.is_default, candidates.created_at
    FROM candidates
    ORDER BY candidates.search_rank DESC, candidates.is_default DESC, candidates.created_at, candidates.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT page.id, totals.total_count
  FROM totals
  LEFT JOIN page ON true
  ORDER BY page.search_rank DESC, page.is_default DESC, page.created_at, page.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_warehouse_landing_row_metrics(
  p_tenant_id uuid,
  p_warehouse_ids uuid[]
)
RETURNS TABLE(
  warehouse_id uuid,
  tracked_skus bigint,
  sellable_units numeric,
  low_stock_skus bigint,
  stockout_skus bigint,
  idle_stock_skus bigint,
  last_inventory_update timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT w.id
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND w.id = ANY(COALESCE(p_warehouse_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), last_sales AS MATERIALIZED (
    SELECT
      ti.warehouse_id,
      ti.tenant_product_id,
      MAX(app.metric_day_ist(i.invoice_date, i.created_at)) AS last_invoice_day
    FROM app.tenant_inventory ti
    JOIN requested r ON r.id = ti.warehouse_id
    LEFT JOIN app.invoice_items ii
      ON ii.tenant_product_id = ti.tenant_product_id
      AND ii.deleted_at IS NULL
    LEFT JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
    WHERE ti.deleted_at IS NULL
    GROUP BY ti.warehouse_id, ti.tenant_product_id
  )
  SELECT
    r.id,
    COUNT(DISTINCT ti.tenant_product_id) AS tracked_skus,
    COALESCE(SUM(COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0)), 0) AS sellable_units,
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE COALESCE(ti.qty_available, 0) > 0
        AND ti.reorder_point IS NOT NULL
        AND COALESCE(ti.qty_available, 0) <= ti.reorder_point
    ) AS low_stock_skus,
    COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available, 0) <= 0) AS stockout_skus,
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE COALESCE(ti.qty_available, 0) > 0
        AND (ls.last_invoice_day IS NULL OR ls.last_invoice_day < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 90))
    ) AS idle_stock_skus,
    MAX(ti.updated_at) AS last_inventory_update
  FROM requested r
  LEFT JOIN app.tenant_inventory ti
    ON ti.warehouse_id = r.id
    AND ti.deleted_at IS NULL
  LEFT JOIN last_sales ls
    ON ls.warehouse_id = ti.warehouse_id
    AND ls.tenant_product_id = ti.tenant_product_id
  GROUP BY r.id;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_warehouses_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
  WITH scoped AS MATERIALIZED (
    SELECT
      w.id,
      w.name,
      COALESCE(w.address ->> 'city', '') AS city,
      w.status,
      w.updated_at
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (p_location_ids IS NULL OR w.location_id = ANY(p_location_ids))
  ), metrics AS MATERIALIZED (
    SELECT *
    FROM app.get_seller_warehouse_landing_row_metrics(
      p_tenant_id,
      ARRAY(SELECT s.id FROM scoped s)
    )
  ), merged AS MATERIALIZED (
    SELECT
      s.id,
      s.name,
      s.city,
      s.status,
      COALESCE(m.tracked_skus, 0) AS tracked_skus,
      COALESCE(m.sellable_units, 0) AS sellable_units,
      COALESCE(m.low_stock_skus, 0) AS low_stock_skus,
      COALESCE(m.stockout_skus, 0) AS stockout_skus,
      COALESCE(m.idle_stock_skus, 0) AS idle_stock_skus,
      COALESCE(m.last_inventory_update, s.updated_at) AS last_updated
    FROM scoped s
    LEFT JOIN metrics m ON m.warehouse_id = s.id
  ), totals AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::bigint AS active_warehouses,
      COALESCE(SUM(tracked_skus), 0)::bigint AS tracked_skus,
      COUNT(*) FILTER (WHERE low_stock_skus > 0 OR stockout_skus > 0)::bigint AS low_stock_warehouses,
      COALESCE(SUM(idle_stock_skus), 0)::bigint AS idle_stock_skus
    FROM merged
  ), stock_attention AS (
    SELECT id, name, city, low_stock_skus + stockout_skus AS value
    FROM merged
    WHERE low_stock_skus > 0 OR stockout_skus > 0
    ORDER BY low_stock_skus + stockout_skus DESC, id
    LIMIT 3
  ), idle_stock AS (
    SELECT id, name, city, idle_stock_skus AS value
    FROM merged
    WHERE idle_stock_skus > 0
    ORDER BY idle_stock_skus DESC, id
    LIMIT 3
  ), recently_replenished AS (
    SELECT id, name, city, tracked_skus AS value, last_updated
    FROM merged
    WHERE tracked_skus > 0
    ORDER BY last_updated DESC NULLS LAST, id
    LIMIT 3
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
        SELECT jsonb_agg(jsonb_build_object('id', sa.id, 'name', sa.name, 'city', sa.city, 'value', sa.value) ORDER BY sa.value DESC, sa.id)
        FROM stock_attention sa
      ), '[]'::jsonb),
      'idle_stock', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', isr.id, 'name', isr.name, 'city', isr.city, 'value', isr.value) ORDER BY isr.value DESC, isr.id)
        FROM idle_stock isr
      ), '[]'::jsonb),
      'recently_replenished', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', rr.id, 'name', rr.name, 'city', rr.city, 'value', rr.value, 'last_updated', rr.last_updated) ORDER BY rr.last_updated DESC NULLS LAST, rr.id)
        FROM recently_replenished rr
      ), '[]'::jsonb)
    )
  )
  FROM totals;
$$;

REVOKE ALL ON FUNCTION app.get_seller_warehouse_landing_row_metrics(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_warehouse_landing_row_metrics(uuid, uuid[]) TO service_role;
