-- Perf: search_products_scoped joined the whole tenant catalog to brand/
-- category/campaign/inventory BEFORE filtering by search text -- for a
-- 454-product tenant (Wine Yard) that meant every call, search or browse,
-- paid the same join-fan-out cost regardless of how selective the actual
-- search was (confirmed via live EXPLAIN, see 20260829114513's log entry:
-- empty-query 220ms and a real search 113ms were nearly identical in
-- buffer cost -- the join, not the text match, dominated).
--
-- Root cause this migration fixes: the search-match predicate never
-- actually needed the joins. app.tenant_products.search_vector is a
-- trigger-maintained tsvector that ALREADY denormalizes brand name +
-- category name + master product name + attributes at write time
-- (app.tenant_products_search_vector_update trigger) -- confirmed by
-- reading the trigger body directly. So @@ ts_query / @@ prefix_ts_query
-- against tp.search_vector (GIN-indexed: idx_tenant_products_search_vector)
-- is already a complete, join-free search match. Same for the LIKE
-- fallbacks (tp.name_override, tp.internal_sku -- both tp's own columns)
-- and the category_scope_id / campaign_id filters (rewritten as EXISTS
-- subqueries against tp instead of a join used only for filtering).
--
-- New structure: filter tp down to the matching set FIRST (search text,
-- ids, brand/category ids, category_scope_id, campaign_id, allowed_brand_ids
-- -- all evaluable on tp alone via EXISTS/indexed columns), THEN join
-- brand/category/inventory/campaign display_order only for that reduced
-- set. For a real search query this collapses the join fan-out to
-- (matching rows) instead of (whole tenant catalog); for a browse/filter
-- call with no search text, the join set is the same as before (browsing
-- inherently needs the whole filtered catalog) -- no regression there,
-- only removes the wasted search_text computation (already fixed in
-- 20260829114513, kept here).
--
-- The only downstream use of search_text (join-dependent, since it's
-- brand/category names concatenated) is the trigram similarity boost in
-- search_rank, which only matters once the set is already small (matched
-- rows only) -- computed post-join now, same as before, just over far
-- fewer rows in the search case.
--
-- Same signature, same output columns, same sort/pagination -- behavior-
-- preserving for every filter combination. Verify with live EXPLAIN +
-- side-by-side output diff against the currently-deployed version before
-- treating this as done (same discipline as the buyer-app v4 cutover).

CREATE OR REPLACE FUNCTION app.search_products_scoped(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_buyer_id uuid DEFAULT NULL,
  p_price_list_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_ids uuid[] DEFAULT NULL,
  p_brand_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_allowed_brand_ids uuid[] DEFAULT NULL,
  p_warehouse_ids uuid[] DEFAULT NULL,
  p_availability text DEFAULT 'show_all',
  p_sort text DEFAULT 'relevance',
  p_include_inventory boolean DEFAULT true,
  p_campaign_id uuid DEFAULT NULL,
  p_category_scope_id uuid DEFAULT NULL
)
RETURNS TABLE(
  tenant_product_id uuid,
  product_name text,
  sku text,
  brand_id uuid,
  brand_name text,
  category_id uuid,
  category_name text,
  hsn_code text,
  tax_pct numeric,
  on_hand numeric,
  reorder_point numeric,
  unit_price numeric,
  mrp numeric,
  base_selling_price numeric,
  cost_price numeric,
  default_uom text,
  pack_size numeric,
  created_at timestamptz,
  search_rank double precision,
  total_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH normalized AS (
    SELECT
      NULLIF(btrim(p_query), '') AS query,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('english', NULLIF(btrim(p_query), ''))
      END AS ts_query,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL
        ELSE (
          SELECT to_tsquery(
            'english',
            string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
          )
          FROM unnest(tsvector_to_array(to_tsvector('english', NULLIF(btrim(p_query), '')))) AS terms(lexeme)
        )
      END AS prefix_ts_query,
      lower(NULLIF(btrim(p_query), '')) AS like_q,
      CASE
        WHEN p_buyer_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM app.buyers b
          WHERE b.id = p_buyer_id
            AND b.tenant_id = p_tenant_id
            AND b.deleted_at IS NULL
        ) THEN p_buyer_id
      END AS buyer_id,
      CASE
        WHEN p_price_list_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM app.price_lists pl
          WHERE pl.id = p_price_list_id
            AND pl.tenant_id = p_tenant_id
            AND pl.deleted_at IS NULL
        ) THEN p_price_list_id
      END AS price_list_id,
      LEAST(GREATEST(p_limit, 1), 100) AS page_size,
      GREATEST(p_offset, 0) AS page_offset
  ),
  matched_tp AS (
    -- Filter on tenant_products alone -- search_vector already denormalizes
    -- brand/category names (see migration header), so this needs no joins.
    SELECT tp.id
    FROM app.tenant_products tp
    CROSS JOIN normalized n
    WHERE tp.tenant_id = p_tenant_id
      AND EXISTS (SELECT 1 FROM app.tenants tenant WHERE tenant.id = p_tenant_id)
      AND tp.is_active = true
      AND tp.deleted_at IS NULL
      AND (p_ids IS NULL OR tp.id = ANY (p_ids))
      AND (p_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_brand_ids))
      AND (p_category_ids IS NULL OR tp.tenant_category_id = ANY (p_category_ids))
      AND (p_allowed_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_allowed_brand_ids))
      AND (
        p_category_scope_id IS NULL
        OR tp.tenant_category_id = p_category_scope_id
        OR EXISTS (
          SELECT 1 FROM app.tenant_categories tc
          WHERE tc.id = tp.tenant_category_id AND tc.master_category_id = p_category_scope_id
        )
        OR EXISTS (
          SELECT 1 FROM catalog.products cp
          WHERE cp.id = tp.master_product_id AND cp.category_id = p_category_scope_id
        )
      )
      AND (
        p_campaign_id IS NULL
        OR EXISTS (
          SELECT 1 FROM app.campaign_items ci
          JOIN app.campaigns campaign ON campaign.id = ci.campaign_id
          WHERE ci.campaign_id = p_campaign_id
            AND ci.tenant_product_id = tp.id
            AND ci.deleted_at IS NULL
            AND campaign.tenant_id = p_tenant_id
            AND campaign.deleted_at IS NULL
        )
      )
      AND (
        n.query IS NULL
        OR (n.ts_query IS NOT NULL AND tp.search_vector @@ n.ts_query)
        OR (n.prefix_ts_query IS NOT NULL AND tp.search_vector @@ n.prefix_ts_query)
        OR lower(tp.name_override) LIKE '%' || n.like_q || '%'
        OR lower(tp.internal_sku) LIKE '%' || n.like_q || '%'
      )
  ),
  inventory AS (
    SELECT
      ti.tenant_product_id,
      SUM(COALESCE(ti.qty_available, 0))::numeric AS on_hand,
      MAX(COALESCE(ti.reorder_point, 0))::numeric AS reorder_point,
      MAX(ti.updated_at) AS inventory_updated_at
    FROM app.tenant_inventory ti
    JOIN matched_tp mtp ON mtp.id = ti.tenant_product_id
    WHERE ti.deleted_at IS NULL
      AND p_include_inventory
      AND p_availability NOT IN ('show_all', 'show_everything')
      AND (p_warehouse_ids IS NULL OR ti.warehouse_id = ANY (p_warehouse_ids))
    GROUP BY ti.tenant_product_id
  ),
  scoped_products AS (
    SELECT
      tp.id AS tenant_product_id,
      COALESCE(tp.name_override, cp.name, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      tp.name_override,
      tp.tenant_brand_id AS brand_id,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS brand_name,
      tp.tenant_category_id AS category_id,
      COALESCE(tc.name, '') AS category_name,
      COALESCE(tp.hsn_code, cp.hsn_code) AS hsn_code,
      COALESCE(tp.gst_rate, cp.gst_rate) AS tax_pct,
      COALESCE(inv.on_hand, 0) AS on_hand,
      COALESCE(inv.reorder_point, 0) AS reorder_point,
      inv.inventory_updated_at,
      tp.base_selling_price AS unit_price,
      COALESCE(tp.mrp, 0) AS mrp,
      tp.base_selling_price,
      tp.cost_price,
      tp.default_uom,
      tp.pack_size,
      tp.created_at,
      tp.search_vector,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL
        ELSE lower(
          concat_ws(
            ' ',
            COALESCE(tp.name_override, cp.name, ''),
            COALESCE(tp.internal_sku, ''),
            COALESCE(tb.display_name_override, cb.name, ''),
            COALESCE(tc.name, ''),
            COALESCE(tp.hsn_code, cp.hsn_code, ''),
            COALESCE(tp.attributes_override::text, ''),
            COALESCE(cp.attributes::text, '')
          )
        )
      END AS search_text,
      campaign_scope.display_order AS campaign_display_order
    FROM matched_tp mtp
    JOIN app.tenant_products tp ON tp.id = mtp.id
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc
      ON tc.id = tp.tenant_category_id
      AND tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    LEFT JOIN LATERAL (
      SELECT ci.display_order
      FROM app.campaign_items ci
      WHERE p_campaign_id IS NOT NULL
        AND ci.campaign_id = p_campaign_id
        AND ci.tenant_product_id = tp.id
        AND ci.deleted_at IS NULL
      ORDER BY ci.display_order NULLS LAST, ci.id
      LIMIT 1
    ) campaign_scope ON true
  ),
  ranked AS (
    SELECT
      sp.*,
      COALESCE(
        CASE
          WHEN n.ts_query IS NOT NULL AND sp.search_vector @@ n.ts_query
            THEN ts_rank(sp.search_vector, n.ts_query)
          WHEN n.prefix_ts_query IS NOT NULL AND sp.search_vector @@ n.prefix_ts_query
            THEN 0.75 * ts_rank(sp.search_vector, n.prefix_ts_query)
          ELSE 0
        END,
        0
      )
      + CASE
          WHEN n.like_q IS NOT NULL AND n.like_q <> ''
            THEN 0.25 * public.similarity(sp.search_text, n.like_q)
          ELSE 0
        END AS search_rank
    FROM scoped_products sp
    CROSS JOIN normalized n
    WHERE (
      p_availability = 'show_all'
      OR p_availability = 'show_everything'
      OR (p_availability = 'in_stock' AND COALESCE(sp.on_hand, 0) > 0)
      OR (p_availability = 'in_stock_only' AND COALESCE(sp.on_hand, 0) > 0)
      OR (p_availability = 'low_stock' AND COALESCE(sp.on_hand, 0) > 0 AND COALESCE(sp.reorder_point, 0) > 0 AND COALESCE(sp.on_hand, 0) <= COALESCE(sp.reorder_point, 0))
      OR (p_availability = 'low_stock_only' AND COALESCE(sp.on_hand, 0) > 0 AND COALESCE(sp.reorder_point, 0) > 0 AND COALESCE(sp.on_hand, 0) <= COALESCE(sp.reorder_point, 0))
      OR (p_availability = 'out_of_stock' AND COALESCE(sp.on_hand, 0) <= 0)
      OR (
        p_availability = 'new_in_stock_today'
        AND COALESCE(sp.on_hand, 0) > 0
        AND sp.inventory_updated_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
      )
      OR (
        p_availability = 'old_stock'
        AND sp.created_at < now() - interval '7 days'
        AND NOT (
          COALESCE(sp.on_hand, 0) > 0
          AND sp.inventory_updated_at >= now() - interval '3 days'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM app.order_items oi
          JOIN app.orders recent_order ON recent_order.id = oi.order_id
          WHERE oi.tenant_product_id = sp.tenant_product_id
            AND oi.deleted_at IS NULL
            AND recent_order.tenant_id = p_tenant_id
            AND recent_order.deleted_at IS NULL
            AND recent_order.status <> 'cancelled'
            AND COALESCE(
              (recent_order.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'),
              recent_order.created_at
            ) >= now() - interval '30 days'
        )
      )
    )
  ),
  paged AS MATERIALIZED (
    SELECT
      ranked.*,
      COUNT(*) OVER() AS total_count,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN n.query IS NULL AND p_campaign_id IS NOT NULL THEN 0
            WHEN n.query IS NULL AND p_sort = 'created_desc' THEN 0
            WHEN n.query IS NULL AND p_sort = 'name_asc' THEN 1
            ELSE 2
          END ASC,
          CASE WHEN n.query IS NULL AND p_campaign_id IS NOT NULL THEN ranked.campaign_display_order END ASC NULLS LAST,
          CASE WHEN n.query IS NULL AND p_sort = 'created_desc' THEN ranked.created_at END DESC,
          CASE WHEN n.query IS NULL AND p_sort = 'name_asc' THEN ranked.product_name END ASC,
          CASE WHEN n.query IS NULL AND p_sort = 'name_asc' THEN ranked.sku END ASC,
          ranked.search_rank DESC,
          ranked.product_name ASC,
          ranked.sku ASC,
          ranked.tenant_product_id ASC
      ) AS page_order
    FROM ranked
    CROSS JOIN normalized n
    ORDER BY page_order
    OFFSET (SELECT page_offset FROM normalized)
    LIMIT (SELECT page_size FROM normalized)
  ),
  page_inventory AS (
    SELECT
      ti.tenant_product_id,
      SUM(COALESCE(ti.qty_available, 0))::numeric AS on_hand,
      MAX(COALESCE(ti.reorder_point, 0))::numeric AS reorder_point
    FROM app.tenant_inventory ti
    JOIN paged page ON page.tenant_product_id = ti.tenant_product_id
    WHERE p_include_inventory
      AND ti.deleted_at IS NULL
      AND (p_warehouse_ids IS NULL OR ti.warehouse_id = ANY (p_warehouse_ids))
    GROUP BY ti.tenant_product_id
  )
  SELECT
    page.tenant_product_id,
    page.product_name,
    page.sku,
    page.brand_id,
    page.brand_name,
    page.category_id,
    page.category_name,
    page.hsn_code,
    page.tax_pct,
    COALESCE(page_inv.on_hand, page.on_hand, 0) AS on_hand,
    COALESCE(page_inv.reorder_point, page.reorder_point, 0) AS reorder_point,
    COALESCE(
      pl_override.price,
      CASE
        WHEN n.buyer_id IS NOT NULL THEN app.resolve_price(page.tenant_product_id, n.buyer_id, 1)
        ELSE NULL
      END,
      page.base_selling_price,
      0
    ) AS unit_price,
    page.mrp,
    page.base_selling_price,
    page.cost_price,
    page.default_uom,
    page.pack_size,
    page.created_at,
    page.search_rank,
    page.total_count
  FROM paged page
  CROSS JOIN normalized n
  LEFT JOIN page_inventory page_inv ON page_inv.tenant_product_id = page.tenant_product_id
  LEFT JOIN LATERAL (
    SELECT pli.price
    FROM app.price_list_items pli
    WHERE n.price_list_id IS NOT NULL
      AND pli.price_list_id = n.price_list_id
      AND pli.tenant_product_id = page.tenant_product_id
      AND pli.deleted_at IS NULL
      AND COALESCE(pli.min_qty, 1) <= 1
    ORDER BY COALESCE(pli.min_qty, 1) DESC, pli.created_at DESC
    LIMIT 1
  ) pl_override ON true
  ORDER BY page.page_order;
$$;

-- CREATE OR REPLACE with an unchanged signature preserves existing grants.
