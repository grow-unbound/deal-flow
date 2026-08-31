-- Second half of the metrics_product_snapshot staleness fix
-- (20260830051504 fixed the v4 tick; these are the other two live
-- readers found in the same audit). Same root cause: metrics_product_
-- snapshot has had no writer anywhere in the schema for a month, so
-- these two search RPCs were serving month-stale on_hand/days_cover/
-- stock_status on the catalog composer and price-list composer product
-- pickers. Replaced with the same live app.tenant_inventory (+
-- app.kpi_product_daily for days_cover) computation used by
-- app.search_brand_products_detail and the v4 tick fix.

CREATE OR REPLACE FUNCTION app.search_catalog_products_detail(p_tenant_id uuid, p_catalog_id uuid, p_query text DEFAULT NULL::text, p_member text DEFAULT 'yes'::text, p_brand text[] DEFAULT NULL::text[], p_category text[] DEFAULT NULL::text[], p_stock text[] DEFAULT NULL::text[], p_sort text DEFAULT 'catalog_order'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(item_id uuid, tenant_product_id uuid, product_name text, sku text, brand_name text, category_name text, mrp numeric, base_selling_price numeric, override_price numeric, catalog_order integer, on_hand numeric, days_cover numeric, catalog_units_sold bigint, catalog_gmv numeric, item_tag text, is_member boolean, image_url text, stock_status text, cost_price numeric, discount_pct numeric, margin_pct numeric, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
  WITH catalog AS MATERIALIZED (
    SELECT c.id
    FROM app.campaigns c
    WHERE c.id = p_catalog_id
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), sales AS MATERIALIZED (
    SELECT x.tenant_product_id, SUM(x.units)::bigint AS units, SUM(x.gmv)::numeric AS gmv
    FROM (
      SELECT oi.tenant_product_id, COALESCE(SUM(oi.qty), 0)::numeric AS units,
        COALESCE(SUM(COALESCE(oi.line_total, COALESCE(oi.qty, 0) * COALESCE(oi.unit_price, 0))), 0)::numeric AS gmv
      FROM app.orders o
      JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = oi.tenant_product_id AND ci.deleted_at IS NULL
      WHERE o.tenant_id = p_tenant_id
        AND o.campaign_id = p_catalog_id
        AND o.deleted_at IS NULL
        AND o.status <> 'cancelled'
      GROUP BY oi.tenant_product_id
      UNION ALL
      SELECT ei.tenant_product_id, COALESCE(SUM(ei.qty), 0)::numeric AS units,
        COALESCE(SUM(COALESCE(ei.line_total, COALESCE(ei.qty, 0) * COALESCE(ei.unit_price, 0))), 0)::numeric AS gmv
      FROM app.estimates e
      JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = ei.tenant_product_id AND ci.deleted_at IS NULL
      WHERE e.tenant_id = p_tenant_id
        AND e.campaign_id = p_catalog_id
        AND e.deleted_at IS NULL
        AND e.status NOT IN ('pending', 'void')
        AND e.converted_to_order_id IS NULL
      GROUP BY ei.tenant_product_id
    ) x
    GROUP BY x.tenant_product_id
  ), inventory AS MATERIALIZED (
    SELECT
      i.tenant_product_id,
      SUM(GREATEST(COALESCE(i.qty_available, 0) - COALESCE(i.qty_reserved, 0), 0))::numeric AS available,
      SUM(COALESCE(i.reorder_point, 0))::numeric AS reorder_point
    FROM app.tenant_inventory i
    JOIN app.tenant_products inv_tp ON inv_tp.id = i.tenant_product_id AND inv_tp.tenant_id = p_tenant_id AND inv_tp.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
    GROUP BY i.tenant_product_id
  ), velocity AS MATERIALIZED (
    SELECT k.tenant_product_id, SUM(k.units_sold)::numeric AS units_mtd
    FROM app.kpi_product_daily k
    WHERE k.tenant_id = p_tenant_id AND k.deleted_at IS NULL AND k.day >= date_trunc('month', now())::date
    GROUP BY k.tenant_product_id
  ), scoped AS MATERIALIZED (
    SELECT
      ci.id AS item_id,
      tp.id AS tenant_product_id,
      COALESCE(NULLIF(tp.name_override, ''), cp.name, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      COALESCE(NULLIF(tb.display_name_override, ''), cb.name, '—') AS brand_name,
      COALESCE(tc.name, cc.name, '—') AS category_name,
      tp.mrp,
      tp.base_selling_price,
      ci.price_override AS override_price,
      COALESCE(ci.display_order, 2147483647) AS catalog_order,
      COALESCE(inv.available, 0) AS on_hand,
      CASE WHEN COALESCE(vel.units_mtd, 0) > 0
        THEN ROUND(COALESCE(inv.available, 0) / (vel.units_mtd / GREATEST(EXTRACT(day FROM now())::numeric, 1)), 1)
        ELSE 0
      END AS days_cover,
      COALESCE(s.units, 0)::bigint AS units,
      COALESCE(s.gmv, 0)::numeric AS gmv,
      CASE
        WHEN ci.is_featured THEN 'new'
        WHEN app.product_is_new_stock_today(tp.id) THEN 'new_stock'
        ELSE 'none'
      END AS item_tag,
      (ci.id IS NOT NULL) AS is_member,
      COALESCE(tp.r2_thumb_key, tp.r2_small_key, tp.image_urls[1], cp.image_urls[1]) AS image_url,
      CASE
        WHEN app.product_is_new_stock_today(tp.id) THEN 'new_stock'
        WHEN COALESCE(inv.available, 0) <= 0 THEN 'out_of_stock'
        WHEN COALESCE(inv.available, 0) > 0 AND COALESCE(inv.available, 0) <= COALESCE(inv.reorder_point, 0) THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status,
      tp.cost_price,
      ts_rank_cd(tp.search_vector, COALESCE(q.exact_query, q.prefix_query)) AS rank
    FROM catalog c
    CROSS JOIN query_terms q
    JOIN app.tenant_products tp ON tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    LEFT JOIN app.campaign_items ci ON ci.campaign_id = c.id AND ci.tenant_product_id = tp.id AND ci.deleted_at IS NULL
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id AND tb.deleted_at IS NULL
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id AND tc.deleted_at IS NULL
    LEFT JOIN catalog.categories cc ON cc.id = cp.category_id
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    LEFT JOIN velocity vel ON vel.tenant_product_id = tp.id
    LEFT JOIN sales s ON s.tenant_product_id = tp.id
    WHERE (q.exact_query IS NULL OR tp.search_vector @@ q.exact_query OR tp.search_vector @@ q.prefix_query)
  ), priced AS MATERIALIZED (
    SELECT
      s.*,
      COALESCE(s.override_price, s.base_selling_price) AS campaign_price,
      CASE WHEN COALESCE(s.base_selling_price, 0) > 0 THEN ROUND(((s.base_selling_price - COALESCE(s.override_price, s.base_selling_price)) / s.base_selling_price) * 100, 2) END AS discount_pct,
      CASE WHEN COALESCE(COALESCE(s.override_price, s.base_selling_price), 0) > 0 AND COALESCE(s.cost_price, 0) > 0 THEN ROUND(((COALESCE(s.override_price, s.base_selling_price) - s.cost_price) / COALESCE(s.override_price, s.base_selling_price)) * 100, 2) END AS margin_pct
    FROM scoped s
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM priced
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_brand), 0) = 0 OR brand_name = ANY(p_brand))
      AND (COALESCE(cardinality(p_category), 0) = 0 OR category_name = ANY(p_category))
      AND (COALESCE(cardinality(p_stock), 0) = 0 OR stock_status = ANY(p_stock))
  )
  SELECT
    f.item_id,
    f.tenant_product_id,
    f.product_name,
    f.sku,
    f.brand_name,
    f.category_name,
    f.mrp,
    f.base_selling_price,
    f.override_price,
    f.catalog_order,
    f.on_hand,
    f.days_cover,
    f.units,
    f.gmv,
    f.item_tag,
    f.is_member,
    f.image_url,
    f.stock_status,
    f.cost_price,
    f.discount_pct,
    f.margin_pct,
    count(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'brand_asc' THEN f.brand_name END,
    CASE WHEN p_sort = 'units_desc' THEN f.units END DESC,
    CASE WHEN p_sort = 'sales_desc' THEN f.gmv END DESC,
    CASE WHEN p_sort = 'days_cover_asc' THEN f.days_cover END ASC,
    CASE WHEN p_sort NOT IN ('brand_asc', 'units_desc', 'sales_desc', 'days_cover_asc') THEN f.catalog_order END,
    f.product_name,
    f.tenant_product_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

CREATE OR REPLACE FUNCTION app.search_price_list_products_detail(p_tenant_id uuid, p_price_list_id uuid, p_query text DEFAULT NULL::text, p_member text DEFAULT 'yes'::text, p_brand text[] DEFAULT NULL::text[], p_category text[] DEFAULT NULL::text[], p_stock text[] DEFAULT NULL::text[], p_sort text DEFAULT 'product_asc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(item_id uuid, tenant_product_id uuid, product_name text, sku text, brand_name text, category_name text, mrp numeric, base_price numeric, list_price numeric, cost_price numeric, discount_pct numeric, margin_pct numeric, is_member boolean, image_url text, stock_status text, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
  WITH price_list AS MATERIALIZED (
    SELECT pl.id, pl.pricing_strategy, pl.strategy_value
    FROM app.price_lists pl
    WHERE pl.id = p_price_list_id
      AND pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), inventory AS MATERIALIZED (
    SELECT
      i.tenant_product_id,
      SUM(GREATEST(COALESCE(i.qty_available, 0) - COALESCE(i.qty_reserved, 0), 0))::numeric AS available,
      SUM(COALESCE(i.reorder_point, 0))::numeric AS reorder_point
    FROM app.tenant_inventory i
    JOIN app.tenant_products inv_tp ON inv_tp.id = i.tenant_product_id AND inv_tp.tenant_id = p_tenant_id AND inv_tp.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
    GROUP BY i.tenant_product_id
  ), scoped AS MATERIALIZED (
    SELECT
      pli.id AS item_id,
      tp.id AS tenant_product_id,
      COALESCE(NULLIF(tp.name_override, ''), cp.name, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      COALESCE(NULLIF(tb.display_name_override, ''), cb.name, '—') AS brand_name,
      COALESCE(tc.name, cc.name, '—') AS category_name,
      tp.mrp,
      tp.base_selling_price AS base_price,
      CASE
        WHEN pli.id IS NOT NULL THEN pli.price
        WHEN pl.pricing_strategy = 'percentage' THEN GREATEST(COALESCE(tp.base_selling_price, 0) * (1 - COALESCE(pl.strategy_value, 0) / 100), 0)
        WHEN pl.pricing_strategy = 'flat_off_base' THEN GREATEST(COALESCE(tp.base_selling_price, 0) - COALESCE(pl.strategy_value, 0), 0)
        ELSE NULL
      END::numeric AS list_price,
      tp.cost_price,
      (pli.id IS NOT NULL) AS is_member,
      COALESCE(tp.r2_thumb_key, tp.r2_small_key, tp.image_urls[1], cp.image_urls[1]) AS image_url,
      CASE
        WHEN app.product_is_new_stock_today(tp.id) THEN 'new_stock'
        WHEN COALESCE(inv.available, 0) <= 0 THEN 'out_of_stock'
        WHEN COALESCE(inv.available, 0) > 0 AND COALESCE(inv.available, 0) <= COALESCE(inv.reorder_point, 0) THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status,
      ts_rank_cd(tp.search_vector, COALESCE(q.exact_query, q.prefix_query)) AS rank
    FROM price_list pl
    CROSS JOIN query_terms q
    JOIN app.tenant_products tp ON tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    LEFT JOIN app.price_list_items pli ON pli.price_list_id = pl.id AND pli.tenant_product_id = tp.id AND pli.deleted_at IS NULL
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id AND tb.deleted_at IS NULL
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id AND tc.deleted_at IS NULL
    LEFT JOIN catalog.categories cc ON cc.id = cp.category_id
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    WHERE (q.exact_query IS NULL OR tp.search_vector @@ q.exact_query OR tp.search_vector @@ q.prefix_query)
  ), priced AS MATERIALIZED (
    SELECT
      s.*,
      CASE WHEN COALESCE(s.base_price, 0) > 0 AND s.list_price IS NOT NULL THEN ROUND(((s.base_price - s.list_price) / s.base_price) * 100, 2) END AS discount_pct,
      CASE WHEN COALESCE(s.list_price, 0) > 0 AND COALESCE(s.cost_price, 0) > 0 THEN ROUND(((s.list_price - s.cost_price) / s.list_price) * 100, 2) END AS margin_pct
    FROM scoped s
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM priced
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_brand), 0) = 0 OR brand_name = ANY(p_brand))
      AND (COALESCE(cardinality(p_category), 0) = 0 OR category_name = ANY(p_category))
      AND (COALESCE(cardinality(p_stock), 0) = 0 OR stock_status = ANY(p_stock))
  )
  SELECT
    f.item_id,
    f.tenant_product_id,
    f.product_name,
    f.sku,
    f.brand_name,
    f.category_name,
    f.mrp,
    f.base_price,
    f.list_price,
    f.cost_price,
    f.discount_pct,
    f.margin_pct,
    f.is_member,
    f.image_url,
    f.stock_status,
    count(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'brand_asc' THEN f.brand_name END,
    CASE WHEN p_sort = 'list_desc' THEN f.list_price END DESC NULLS LAST,
    CASE WHEN p_sort = 'discount_desc' THEN f.discount_pct END DESC NULLS LAST,
    CASE WHEN p_sort = 'margin_desc' THEN f.margin_pct END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('brand_asc', 'list_desc', 'discount_desc', 'margin_desc') THEN f.product_name END,
    f.product_name,
    f.tenant_product_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;
