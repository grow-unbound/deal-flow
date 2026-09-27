-- Denormalize product/brand/category text + images/GST onto tenant rows at
-- write time (already done for name_override/display_name_override in the
-- app-layer create routes as of this same change; this migration is the
-- one-time catch-up for existing rows), then drop the now-unnecessary live
-- catalog.* joins from every buyer-facing read path.
--
-- Why this is safe: tenant_products.name_override / tenant_brands.
-- display_name_override are always populated at write time by every current
-- create path (manual create, master-linked create, the auto-create-on-import
-- helpers in tenant-product-source-resolution.ts) — confirmed by reading
-- those code paths directly, not assumed. tenant_categories.name is a
-- required NOT NULL column, never falls back to catalog.categories at all.
-- gst_rate/hsn_code/image_urls/logo_url were the one real gap (write paths
-- allowed these to stay null while still linking master_product_id/
-- master_brand_id) -- fixed in the same app-layer change alongside this
-- migration, so this backfill is the last piece making every existing row
-- self-contained too.
--
-- What's explicitly NOT touched here: app.global_search's two catalog.*
-- joins (cosmetic sublabel-description fallback only, shared with the seller
-- command palette, low value relative to the blast radius of editing that
-- large multi-branch function) and reco_get_home/reco_get_product_page
-- (verified via pg_get_functiondef against the live yukti-dev database --
-- these two have zero catalog.* references already, nothing to remove).

-- ============================================================
-- 1. One-time backfill for rows created before the app-layer write-path fix
-- ============================================================

UPDATE app.tenant_products tp
SET name_override = cp.name,
    updated_at = now()
FROM catalog.products cp
WHERE tp.master_product_id = cp.id
  AND tp.name_override IS NULL
  AND tp.deleted_at IS NULL;

UPDATE app.tenant_products tp
SET gst_rate = cp.gst_rate,
    updated_at = now()
FROM catalog.products cp
WHERE tp.master_product_id = cp.id
  AND tp.gst_rate IS NULL
  AND cp.gst_rate IS NOT NULL
  AND tp.deleted_at IS NULL;

UPDATE app.tenant_products tp
SET hsn_code = cp.hsn_code,
    updated_at = now()
FROM catalog.products cp
WHERE tp.master_product_id = cp.id
  AND tp.hsn_code IS NULL
  AND cp.hsn_code IS NOT NULL
  AND tp.deleted_at IS NULL;

UPDATE app.tenant_products tp
SET image_urls = cp.image_urls,
    updated_at = now()
FROM catalog.products cp
WHERE tp.master_product_id = cp.id
  AND (tp.image_urls IS NULL OR array_length(tp.image_urls, 1) IS NULL)
  AND cp.image_urls IS NOT NULL
  AND array_length(cp.image_urls, 1) > 0
  AND tp.deleted_at IS NULL;

UPDATE app.tenant_brands tb
SET display_name_override = cb.name,
    updated_at = now()
FROM catalog.brands cb
WHERE tb.master_brand_id = cb.id
  AND tb.display_name_override IS NULL
  AND tb.deleted_at IS NULL;

UPDATE app.tenant_brands tb
SET logo_url = cb.logo_url,
    updated_at = now()
FROM catalog.brands cb
WHERE tb.master_brand_id = cb.id
  AND tb.logo_url IS NULL
  AND cb.logo_url IS NOT NULL
  AND tb.deleted_at IS NULL;

-- ============================================================
-- 2. search_products_scoped — keep the text-search/tsquery/trigram
--    machinery, drop the catalog.products / catalog.brands fallback joins.
--    Same signature, same output columns, same sort/pagination/pricing.
-- ============================================================

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
SET search_path = pg_catalog, app, catalog, public, extensions
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
      COALESCE(tp.name_override, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      tp.name_override,
      tp.tenant_brand_id AS brand_id,
      COALESCE(tb.display_name_override, 'Brand') AS brand_name,
      tp.tenant_category_id AS category_id,
      COALESCE(tc.name, '') AS category_name,
      tp.hsn_code AS hsn_code,
      tp.gst_rate AS tax_pct,
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
            COALESCE(tp.name_override, ''),
            COALESCE(tp.internal_sku, ''),
            COALESCE(tb.display_name_override, ''),
            COALESCE(tc.name, ''),
            COALESCE(tp.hsn_code, ''),
            COALESCE(tp.attributes_override::text, '')
          )
        )
      END AS search_text,
      campaign_scope.display_order AS campaign_display_order
    FROM matched_tp mtp
    JOIN app.tenant_products tp ON tp.id = mtp.id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
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
            THEN 0.25 * extensions.similarity(sp.search_text, n.like_q)
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

-- ============================================================
-- 3. load_products_scoped -- new function. Same enrichment/pricing shape as
--    search_products_scoped minus the tsquery/prefix-query/trigram-rank
--    machinery: a plain browse/filter/id-list load never needs it, and was
--    paying for it on every call. Replaces two callers: (a) the JS-side
--    resolveCatalogScope's plain-browse branch, which previously called
--    search_products_scoped with an empty query string, and (b) the "arbitrary
--    product-ID-list" callers (home reco, recommendations, cart reconcile)
--    that previously went through the separate enrichBuyerProducts JS join
--    chain instead of any RPC.
-- ============================================================

CREATE OR REPLACE FUNCTION app.load_products_scoped(
  p_tenant_id uuid,
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
  p_sort text DEFAULT 'created_desc',
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
  total_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, public
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH normalized AS (
    SELECT
      CASE
        WHEN p_buyer_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.buyers b
          WHERE b.id = p_buyer_id AND b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
        ) THEN p_buyer_id
      END AS buyer_id,
      CASE
        WHEN p_price_list_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.price_lists pl
          WHERE pl.id = p_price_list_id AND pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL
        ) THEN p_price_list_id
      END AS price_list_id,
      LEAST(GREATEST(p_limit, 1), 100) AS page_size,
      GREATEST(p_offset, 0) AS page_offset
  ),
  matched_tp AS (
    SELECT tp.id
    FROM app.tenant_products tp
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
      COALESCE(tp.name_override, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      tp.tenant_brand_id AS brand_id,
      COALESCE(tb.display_name_override, 'Brand') AS brand_name,
      tp.tenant_category_id AS category_id,
      COALESCE(tc.name, '') AS category_name,
      tp.hsn_code AS hsn_code,
      tp.gst_rate AS tax_pct,
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
      campaign_scope.display_order AS campaign_display_order
    FROM matched_tp mtp
    JOIN app.tenant_products tp ON tp.id = mtp.id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
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
  filtered AS (
    SELECT sp.*
    FROM scoped_products sp
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
      filtered.*,
      COUNT(*) OVER() AS total_count,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN p_campaign_id IS NOT NULL THEN 0
            WHEN p_sort = 'created_desc' THEN 0
            WHEN p_sort = 'name_asc' THEN 1
            ELSE 0
          END ASC,
          CASE WHEN p_campaign_id IS NOT NULL THEN filtered.campaign_display_order END ASC NULLS LAST,
          CASE WHEN p_sort = 'name_asc' THEN filtered.product_name END ASC,
          CASE WHEN p_sort = 'name_asc' THEN filtered.sku END ASC,
          CASE WHEN p_sort <> 'name_asc' OR p_campaign_id IS NOT NULL THEN filtered.created_at END DESC,
          filtered.product_name ASC,
          filtered.sku ASC,
          filtered.tenant_product_id ASC
      ) AS page_order
    FROM filtered
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

REVOKE ALL ON FUNCTION app.load_products_scoped(uuid, uuid, uuid, integer, integer, uuid[], uuid[], uuid[], uuid[], uuid[], text, text, boolean, uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app.load_products_scoped(uuid, uuid, uuid, integer, integer, uuid[], uuid[], uuid[], uuid[], uuid[], text, text, boolean, uuid, uuid) TO service_role;

-- ============================================================
-- 4. get_buyer_product_facets_scoped -- drop catalog.brands/catalog.products/
--    catalog.categories fallback joins. Category facet now purely from
--    tenant_categories (name is NOT NULL, never needed the fallback for
--    display -- only used it for the rare "product has no tenant category"
--    case, which now shows as uncategorized rather than inheriting the
--    master product's category; same accepted behavior change as the
--    category_scope_id filter above).
-- ============================================================

CREATE OR REPLACE FUNCTION app.get_buyer_product_facets_scoped(
  p_tenant_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_allowed_brand_ids uuid[] DEFAULT NULL,
  p_brand_scope_id uuid DEFAULT NULL,
  p_category_scope_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(facet_type text, facet_id uuid, facet_label text, facet_slug text, image_url text, image_thumb_key text, image_medium_key text, product_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '5s'
SET lock_timeout = '2s'
AS $$
  WITH bounds AS (
    SELECT LEAST(GREATEST(p_limit, 1), 200) AS facet_limit
  ),
  scoped_products AS MATERIALIZED (
    SELECT
      tp.id,
      tp.tenant_brand_id,
      tb.master_brand_id,
      COALESCE(tb.display_name_override, 'Brand') AS brand_name,
      tb.logo_url AS brand_logo_url,
      tp.tenant_category_id,
      tc.master_category_id,
      tc.name AS tenant_category_name,
      tc.slug AS tenant_category_slug,
      tc.r2_image_thumb_key,
      tc.r2_image_medium_key
    FROM app.tenant_products tp
    LEFT JOIN app.tenant_brands tb
      ON tb.id = tp.tenant_brand_id
      AND tb.tenant_id = p_tenant_id
      AND tb.deleted_at IS NULL
    LEFT JOIN app.tenant_categories tc
      ON tc.id = tp.tenant_category_id
      AND tc.tenant_id = p_tenant_id
      AND tc.is_active = true
      AND tc.deleted_at IS NULL
    WHERE tp.tenant_id = p_tenant_id
      AND tp.is_active = true
      AND tp.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM app.tenants tenant
        WHERE tenant.id = p_tenant_id
      )
      AND (p_allowed_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_allowed_brand_ids))
      AND (
        p_brand_scope_id IS NULL
        OR tb.id = p_brand_scope_id
        OR tb.master_brand_id = p_brand_scope_id
      )
      AND (
        p_category_scope_id IS NULL
        OR tc.id = p_category_scope_id
        OR tc.master_category_id = p_category_scope_id
      )
      AND (
        p_campaign_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM app.campaign_items ci
          JOIN app.campaigns campaign
            ON campaign.id = ci.campaign_id
            AND campaign.tenant_id = p_tenant_id
            AND campaign.deleted_at IS NULL
          WHERE ci.campaign_id = p_campaign_id
            AND ci.tenant_product_id = tp.id
            AND ci.deleted_at IS NULL
        )
      )
  ),
  brand_facets AS (
    SELECT
      'brand'::text AS facet_type,
      COALESCE(sp.master_brand_id, sp.tenant_brand_id) AS facet_id,
      sp.brand_name AS facet_label,
      NULL::text AS facet_slug,
      sp.brand_logo_url AS image_url,
      NULL::text AS image_thumb_key,
      NULL::text AS image_medium_key,
      COUNT(*)::bigint AS product_count
    FROM scoped_products sp
    WHERE sp.tenant_brand_id IS NOT NULL
    GROUP BY
      COALESCE(sp.master_brand_id, sp.tenant_brand_id),
      sp.brand_name,
      sp.brand_logo_url
    ORDER BY product_count DESC, facet_label ASC, facet_id ASC
    LIMIT (SELECT facet_limit FROM bounds)
  ),
  category_facets AS (
    SELECT
      'category'::text AS facet_type,
      sp.tenant_category_id AS facet_id,
      sp.tenant_category_name AS facet_label,
      sp.tenant_category_slug AS facet_slug,
      NULL::text AS image_url,
      sp.r2_image_thumb_key AS image_thumb_key,
      sp.r2_image_medium_key AS image_medium_key,
      COUNT(*)::bigint AS product_count
    FROM scoped_products sp
    WHERE sp.tenant_category_id IS NOT NULL
      AND sp.tenant_category_name IS NOT NULL
    GROUP BY
      sp.tenant_category_id,
      sp.tenant_category_name,
      sp.tenant_category_slug,
      sp.r2_image_thumb_key,
      sp.r2_image_medium_key
    ORDER BY product_count DESC, facet_label ASC, facet_id ASC
    LIMIT (SELECT facet_limit FROM bounds)
  )
  SELECT * FROM brand_facets
  UNION ALL
  SELECT * FROM category_facets
  ORDER BY facet_type, product_count DESC, facet_label ASC, facet_id ASC;
$$;
