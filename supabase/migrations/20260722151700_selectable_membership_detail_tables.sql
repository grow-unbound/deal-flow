-- Widen detail-tab search RPCs for selectable membership tables.
-- These replace the current member-only/item-only functions with bounded universe reads
-- backed by metrics_* v2 snapshots. Legacy daily KPI tables are not used here.

DROP FUNCTION IF EXISTS app.search_cohort_buyers_detail(uuid, uuid, text, text, text, integer, integer);
CREATE OR REPLACE FUNCTION app.search_cohort_buyers_detail(
  p_tenant_id uuid,
  p_cohort_id uuid,
  p_query text DEFAULT NULL,
  p_member text DEFAULT 'yes',
  p_last_sale text[] DEFAULT NULL,
  p_sales_90d text[] DEFAULT NULL,
  p_buyer_app text[] DEFAULT NULL,
  p_sort text DEFAULT 'spend_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  buyer_id uuid,
  business_name text,
  contact_name text,
  external_ref text,
  geography_label text,
  tier text,
  spend_90d numeric,
  invoice_count_90d bigint,
  demand_value_90d numeric,
  demand_count_90d bigint,
  outstanding_due numeric,
  last_invoice_at timestamptz,
  last_primary_demand_at timestamptz,
  is_member boolean,
  buyer_app_status text,
  primary_demand_kind text,
  mtd_spend numeric,
  orders_mtd bigint,
  aov numeric,
  credit_used numeric,
  last_order_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
  WITH primary_kind AS MATERIALIZED (
    SELECT app.metrics_v2_primary_demand_kind(p_tenant_id) AS kind
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), scoped AS MATERIALIZED (
    SELECT
      b.id,
      b.business_name,
      b.contact_name,
      b.external_ref,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '—') AS geography_label,
      b.tier,
      COALESCE(mbs.invoice_value_90d, 0)::numeric AS spend_90d,
      COALESCE(mbs.invoice_count_90d, 0)::bigint AS invoice_count_90d,
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_value_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_value_90d, 0)
        ELSE 0
      END::numeric AS demand_value_90d,
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_count_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_count_90d, 0)
        ELSE 0
      END::bigint AS demand_count_90d,
      COALESCE(mbs.receivable_amount, 0)::numeric AS outstanding_due,
      mbs.last_invoice_at,
      CASE pk.kind
        WHEN 'orders' THEN mbs.last_order_at
        WHEN 'estimates' THEN mbs.last_estimate_at
        ELSE NULL
      END::timestamptz AS last_primary_demand_at,
      (cm.buyer_id IS NOT NULL) AS is_member,
      app.derive_buyer_app_status(COALESCE(b.is_active, true), COALESCE(mbs.buyer_app_enabled, b.buyer_app_enabled, false)) AS buyer_app_status,
      pk.kind AS primary_demand_kind,
      app.derive_last_order_bucket_v2(mbs.last_invoice_at) AS last_sale_bucket,
      app.derive_sales_90d_level(COALESCE(mbs.invoice_value_90d, 0)) AS sales_90d_level,
      ts_rank_cd(b.search_vector, COALESCE(q.exact_query, q.prefix_query)) AS rank
    FROM app.buyers b
    CROSS JOIN primary_kind pk
    CROSS JOIN query_terms q
    LEFT JOIN app.cohort_members cm ON cm.cohort_id = p_cohort_id AND cm.buyer_id = b.id
    LEFT JOIN app.cohorts c ON c.id = p_cohort_id AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_snapshot mbs ON mbs.tenant_id = p_tenant_id AND mbs.buyer_id = b.id AND mbs.deleted_at IS NULL
    WHERE c.id IS NOT NULL
      AND b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND (q.exact_query IS NULL OR b.search_vector @@ q.exact_query OR b.search_vector @@ q.prefix_query)
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_last_sale), 0) = 0 OR last_sale_bucket = ANY(p_last_sale))
      AND (COALESCE(cardinality(p_sales_90d), 0) = 0 OR sales_90d_level = ANY(p_sales_90d))
      AND (COALESCE(cardinality(p_buyer_app), 0) = 0 OR buyer_app_status = ANY(p_buyer_app))
  )
  SELECT
    f.id,
    f.business_name,
    f.contact_name,
    f.external_ref,
    f.geography_label,
    f.tier,
    f.spend_90d,
    f.invoice_count_90d,
    f.demand_value_90d,
    f.demand_count_90d,
    f.outstanding_due,
    f.last_invoice_at,
    f.last_primary_demand_at,
    f.is_member,
    f.buyer_app_status,
    f.primary_demand_kind,
    f.spend_90d,
    f.demand_count_90d,
    CASE WHEN f.demand_count_90d > 0 THEN ROUND(f.demand_value_90d / f.demand_count_90d, 2) ELSE 0 END,
    f.outstanding_due,
    f.last_invoice_at,
    count(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'invoices_desc' THEN f.invoice_count_90d END DESC,
    CASE WHEN p_sort = 'demand_desc' THEN f.demand_value_90d END DESC,
    CASE WHEN p_sort = 'name_asc' THEN f.business_name END ASC,
    CASE WHEN p_sort = 'last_invoice_desc' THEN f.last_invoice_at END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('invoices_desc', 'demand_desc', 'name_asc', 'last_invoice_desc') THEN f.spend_90d END DESC,
    f.business_name,
    f.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

DROP FUNCTION IF EXISTS app.search_price_list_products_detail(uuid, uuid, text, text, text, integer, integer);
CREATE OR REPLACE FUNCTION app.search_price_list_products_detail(
  p_tenant_id uuid,
  p_price_list_id uuid,
  p_query text DEFAULT NULL,
  p_member text DEFAULT 'yes',
  p_brand text[] DEFAULT NULL,
  p_category text[] DEFAULT NULL,
  p_stock text[] DEFAULT NULL,
  p_sort text DEFAULT 'product_asc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  item_id uuid,
  tenant_product_id uuid,
  product_name text,
  sku text,
  brand_name text,
  category_name text,
  mrp numeric,
  base_price numeric,
  list_price numeric,
  cost_price numeric,
  discount_pct numeric,
  margin_pct numeric,
  is_member boolean,
  image_url text,
  stock_status text,
  on_hand numeric,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
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
      COALESCE(mps.available, 0) AS on_hand,
      CASE
        WHEN app.product_is_new_stock_today(tp.id) THEN 'new_stock'
        WHEN COALESCE(mps.out_of_stock, false) THEN 'out_of_stock'
        WHEN COALESCE(mps.low_stock, false) THEN 'low_stock'
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
    LEFT JOIN app.metrics_product_snapshot mps ON mps.tenant_id = p_tenant_id AND mps.tenant_product_id = tp.id AND mps.deleted_at IS NULL
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
    f.on_hand,
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
$$;

DROP FUNCTION IF EXISTS app.search_catalog_products_detail(uuid, uuid, text, text, text, integer, integer);
CREATE OR REPLACE FUNCTION app.search_catalog_products_detail(
  p_tenant_id uuid,
  p_catalog_id uuid,
  p_query text DEFAULT NULL,
  p_member text DEFAULT 'yes',
  p_brand text[] DEFAULT NULL,
  p_category text[] DEFAULT NULL,
  p_stock text[] DEFAULT NULL,
  p_sort text DEFAULT 'catalog_order',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  item_id uuid,
  tenant_product_id uuid,
  product_name text,
  sku text,
  brand_name text,
  category_name text,
  mrp numeric,
  base_selling_price numeric,
  override_price numeric,
  catalog_order integer,
  on_hand numeric,
  days_cover numeric,
  catalog_units_sold bigint,
  catalog_gmv numeric,
  item_tag text,
  is_member boolean,
  image_url text,
  stock_status text,
  cost_price numeric,
  discount_pct numeric,
  margin_pct numeric,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
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
      COALESCE(mps.available, 0) AS on_hand,
      COALESCE(mps.days_cover, 0) AS days_cover,
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
        WHEN COALESCE(mps.out_of_stock, false) THEN 'out_of_stock'
        WHEN COALESCE(mps.low_stock, false) THEN 'low_stock'
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
    LEFT JOIN app.metrics_product_snapshot mps ON mps.tenant_id = p_tenant_id AND mps.tenant_product_id = tp.id AND mps.deleted_at IS NULL
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
$$;

DROP FUNCTION IF EXISTS app.search_catalog_buyers(uuid, uuid, text, text, text, integer, integer);
CREATE OR REPLACE FUNCTION app.search_catalog_buyers(
  p_tenant_id uuid,
  p_catalog_id uuid,
  p_query text DEFAULT NULL,
  p_member text DEFAULT 'yes',
  p_status text[] DEFAULT NULL,
  p_last_sale text[] DEFAULT NULL,
  p_sales_90d text[] DEFAULT NULL,
  p_buyer_app text[] DEFAULT NULL,
  p_sort text DEFAULT 'gmv_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  buyer_id uuid,
  buyer_name text,
  city text,
  geography_label text,
  cohort_label text,
  opened_status text,
  demand_value numeric,
  demand_count bigint,
  last_opened_at timestamptz,
  last_conversion_at timestamptz,
  last_primary_demand_at timestamptz,
  is_member boolean,
  buyer_app_status text,
  primary_demand_kind text,
  total_count bigint,
  opens_count bigint,
  converted_count bigint,
  attributed_gmv numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
  WITH primary_kind AS MATERIALIZED (
    SELECT app.metrics_v2_primary_demand_kind(p_tenant_id) AS kind
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), catalog AS MATERIALIZED (
    SELECT c.id, c.scope_type, c.scope_value
    FROM app.campaigns c
    WHERE c.id = p_catalog_id
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ), member_ids AS MATERIALIZED (
    SELECT b.id
    FROM catalog c
    JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    WHERE (c.scope_type <> 'all' OR b.is_active)
      AND (c.scope_type = 'all'
       OR (c.scope_type = 'buyer' AND (
         b.id::text = c.scope_value ->> 'buyer_id'
         OR b.id::text IN (SELECT jsonb_array_elements_text(COALESCE(c.scope_value -> 'buyer_ids', '[]'::jsonb)))
       ))
       OR (c.scope_type = 'geography' AND (
         COALESCE(b.geography ->> 'city', '') = COALESCE(c.scope_value ->> 'city', c.scope_value ->> 'value', '')
         OR COALESCE(b.geography ->> 'state', '') = COALESCE(c.scope_value ->> 'state', c.scope_value ->> 'value', '')
       )))
    UNION
    SELECT cm.buyer_id
    FROM catalog c
    JOIN app.cohort_members cm ON cm.cohort_id::text = c.scope_value ->> 'cohort_id'
    WHERE c.scope_type = 'cohort'
    UNION
    SELECT cbm.buyer_id
    FROM catalog c
    JOIN app.campaign_buyer_members cbm ON cbm.campaign_id = c.id AND cbm.valid_until IS NULL
  ), views AS MATERIALIZED (
    SELECT cv.buyer_id, max(cv.viewed_at) AS last_opened_at
    FROM app.campaign_views cv
    WHERE cv.tenant_id = p_tenant_id
      AND cv.campaign_id = p_catalog_id
      AND cv.deleted_at IS NULL
    GROUP BY cv.buyer_id
  ), conversions AS MATERIALIZED (
    SELECT x.buyer_id, count(*)::bigint AS conversions, sum(x.amount)::numeric AS spend, max(x.converted_at) AS last_conversion_at
    FROM (
      SELECT o.id, o.buyer_id,
        sum(COALESCE(oi.line_total, COALESCE(oi.qty, 0) * COALESCE(oi.unit_price, 0)))::numeric AS amount,
        max(COALESCE(o.order_date, o.placed_at, o.created_at)) AS converted_at
      FROM app.orders o
      JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = oi.tenant_product_id AND ci.deleted_at IS NULL
      WHERE o.tenant_id = p_tenant_id
        AND o.campaign_id = p_catalog_id
        AND o.deleted_at IS NULL
        AND o.status <> 'cancelled'
      GROUP BY o.id, o.buyer_id
      UNION ALL
      SELECT e.id, e.buyer_id,
        sum(COALESCE(ei.line_total, COALESCE(ei.qty, 0) * COALESCE(ei.unit_price, 0)))::numeric AS amount,
        max(COALESCE(e.estimate_date, e.created_at)) AS converted_at
      FROM app.estimates e
      JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = ei.tenant_product_id AND ci.deleted_at IS NULL
      WHERE e.tenant_id = p_tenant_id
        AND e.campaign_id = p_catalog_id
        AND e.deleted_at IS NULL
        AND e.status NOT IN ('pending', 'void')
        AND e.converted_to_order_id IS NULL
      GROUP BY e.id, e.buyer_id
    ) x
    GROUP BY x.buyer_id
  ), scoped AS MATERIALIZED (
    SELECT
      b.id AS buyer_id,
      b.business_name AS buyer_name,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '') AS city,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '—') AS geography_label,
      COALESCE(ch.name, CASE WHEN c.scope_type = 'all' THEN 'All buyers' ELSE 'Targeted buyers' END) AS cohort_label,
      CASE WHEN COALESCE(cv.conversions, 0) > 0 THEN 'CONVERTED'
           WHEN v.last_opened_at IS NOT NULL THEN 'OPENED'
           ELSE 'NOT YET OPENED' END AS opened_status,
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_value_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_value_90d, 0)
        ELSE 0
      END::numeric AS demand_value,
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_count_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_count_90d, 0)
        ELSE 0
      END::bigint AS demand_count,
      v.last_opened_at,
      cv.last_conversion_at,
      CASE pk.kind
        WHEN 'orders' THEN mbs.last_order_at
        WHEN 'estimates' THEN mbs.last_estimate_at
        ELSE NULL
      END::timestamptz AS last_primary_demand_at,
      (m.id IS NOT NULL) AS is_member,
      app.derive_buyer_app_status(COALESCE(b.is_active, true), COALESCE(mbs.buyer_app_enabled, b.buyer_app_enabled, false)) AS buyer_app_status,
      pk.kind AS primary_demand_kind,
      app.derive_last_order_bucket_v2(mbs.last_invoice_at) AS last_sale_bucket,
      app.derive_sales_90d_level(COALESCE(mbs.invoice_value_90d, 0)) AS sales_90d_level,
      ts_rank_cd(b.search_vector, COALESCE(q.exact_query, q.prefix_query)) AS rank
    FROM catalog c
    CROSS JOIN primary_kind pk
    CROSS JOIN query_terms q
    JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    LEFT JOIN member_ids m ON m.id = b.id
    LEFT JOIN app.cohorts ch ON ch.id::text = c.scope_value ->> 'cohort_id' AND ch.deleted_at IS NULL
    LEFT JOIN views v ON v.buyer_id = b.id
    LEFT JOIN conversions cv ON cv.buyer_id = b.id
    LEFT JOIN app.metrics_buyer_snapshot mbs ON mbs.tenant_id = p_tenant_id AND mbs.buyer_id = b.id AND mbs.deleted_at IS NULL
    WHERE (q.exact_query IS NULL OR b.search_vector @@ q.exact_query OR b.search_vector @@ q.prefix_query)
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_status), 0) = 0 OR opened_status = ANY(p_status))
      AND (COALESCE(cardinality(p_last_sale), 0) = 0 OR last_sale_bucket = ANY(p_last_sale))
      AND (COALESCE(cardinality(p_sales_90d), 0) = 0 OR sales_90d_level = ANY(p_sales_90d))
      AND (COALESCE(cardinality(p_buyer_app), 0) = 0 OR buyer_app_status = ANY(p_buyer_app))
  ), totals AS MATERIALIZED (
    SELECT
      count(*) FILTER (WHERE opened_status <> 'NOT YET OPENED')::bigint AS opens_count,
      count(*) FILTER (WHERE opened_status = 'CONVERTED')::bigint AS converted_count,
      coalesce(sum(demand_value), 0)::numeric AS attributed_gmv
    FROM filtered
  )
  SELECT
    f.buyer_id,
    f.buyer_name,
    f.city,
    f.geography_label,
    f.cohort_label,
    f.opened_status,
    f.demand_value,
    f.demand_count,
    f.last_opened_at,
    f.last_conversion_at,
    f.last_primary_demand_at,
    f.is_member,
    f.buyer_app_status,
    f.primary_demand_kind,
    count(*) OVER ()::bigint,
    t.opens_count,
    t.converted_count,
    t.attributed_gmv
  FROM filtered f
  CROSS JOIN totals t
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'conversions_desc' THEN f.demand_count END DESC,
    CASE WHEN p_sort = 'recently_opened' THEN f.last_opened_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN f.buyer_name END ASC,
    CASE WHEN p_sort NOT IN ('conversions_desc', 'recently_opened', 'name_asc') THEN f.demand_value END DESC,
    f.buyer_name,
    f.buyer_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION app.search_cohort_buyers_detail(uuid, uuid, text, text, text[], text[], text[], text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_price_list_products_detail(uuid, uuid, text, text, text[], text[], text[], text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_catalog_products_detail(uuid, uuid, text, text, text[], text[], text[], text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_catalog_buyers(uuid, uuid, text, text, text[], text[], text[], text[], text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.search_cohort_buyers_detail(uuid, uuid, text, text, text[], text[], text[], text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_price_list_products_detail(uuid, uuid, text, text, text[], text[], text[], text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_catalog_products_detail(uuid, uuid, text, text, text[], text[], text[], text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_catalog_buyers(uuid, uuid, text, text, text[], text[], text[], text[], text, integer, integer) TO service_role;
