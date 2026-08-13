-- Wire app.global_search() for two purposes it was never used for:
--   1. Buyer-facing global search (products/brands/categories, cohort-brand scoped)
--      via new p_buyer_id / p_allowed_brand_ids params.
--   2. Drop pgvector p_query_embedding entirely (dead: no EMBEDDING_PROVIDER/
--      OPENAI_API_KEY configured anywhere in this app).
-- Also removes customer_matches' location-scoping EXISTS block against
-- orders/invoices/estimates for seller_assistant — customers are now unscoped
-- for both seller_admin and seller_assistant. All other seller branches
-- (brand/category/cohort/campaign/price_list unscoped; order/invoice/estimate/
-- location/warehouse location-scoped for seller_assistant) are unchanged.
--
-- Postgres can't change a function's signature via CREATE OR REPLACE, so the
-- old signature must be dropped first; grants do not survive a DROP.

DROP FUNCTION IF EXISTS app.global_search(text, uuid, text, integer, public.vector, uuid[]);

CREATE FUNCTION app.global_search(
  p_query text,
  p_tenant_id uuid,
  p_role text DEFAULT 'seller_admin',
  p_items_per_group integer DEFAULT 5,
  p_location_ids uuid[] DEFAULT NULL,
  p_buyer_id uuid DEFAULT NULL,
  p_allowed_brand_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  entity_type text,
  id uuid,
  label text,
  sublabel text,
  url_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_like text;
  v_prefix_query_text text;
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_is_assistant boolean := p_role = 'seller_assistant';
  v_is_buyer boolean := p_role IN ('buyer_admin', 'buyer_assistant');
  v_location_ids uuid[] := COALESCE(p_location_ids, ARRAY[]::uuid[]);
  v_limit integer := LEAST(GREATEST(COALESCE(p_items_per_group, 5), 1), 10);
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  v_like := '%' || lower(v_query) || '%';
  v_ts_query := websearch_to_tsquery('english', v_query);

  SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
  INTO v_prefix_query_text
  FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

  IF v_prefix_query_text IS NOT NULL THEN
    v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
  END IF;

  IF v_is_buyer THEN
    RETURN QUERY
    WITH product_matches AS MATERIALIZED (
      SELECT
        'product'::text AS entity_type,
        sp.tenant_product_id AS id,
        sp.product_name AS label,
        concat_ws(' · ', sp.brand_name, sp.category_name, sp.sku) AS sublabel,
        '/products/' || sp.tenant_product_id::text AS url_path,
        sp.search_rank AS rank
      FROM app.search_products_scoped(
        p_tenant_id := p_tenant_id,
        p_query := v_query,
        p_buyer_id := p_buyer_id,
        p_allowed_brand_ids := p_allowed_brand_ids,
        p_limit := v_limit,
        p_offset := 0,
        p_sort := 'relevance',
        p_include_inventory := false
      ) sp
      ORDER BY sp.search_rank DESC, sp.product_name ASC, sp.tenant_product_id ASC
      LIMIT v_limit
    ),
    brand_matches AS MATERIALIZED (
      SELECT
        'brand'::text AS entity_type,
        tb.id,
        COALESCE(tb.display_name_override, cb.name, 'Brand') AS label,
        COALESCE(tb.description_override, tb.description, cb.description, '') AS sublabel,
        '/brands/' || tb.id::text AS url_path,
        CASE
          WHEN tb.search_vector @@ v_ts_query
            THEN 2.0 + ts_rank_cd(tb.search_vector, v_ts_query)::double precision
          ELSE ts_rank_cd(tb.search_vector, v_prefix_ts_query)::double precision
        END AS rank
      FROM app.tenant_brands tb
      LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
      WHERE tb.tenant_id = p_tenant_id
        AND tb.is_active = true
        AND tb.deleted_at IS NULL
        AND (p_allowed_brand_ids IS NULL OR tb.id = ANY (p_allowed_brand_ids))
        AND (
          tb.search_vector @@ v_ts_query
          OR (v_prefix_ts_query IS NOT NULL AND tb.search_vector @@ v_prefix_ts_query)
        )
      ORDER BY rank DESC, 3 ASC, tb.id ASC
      LIMIT v_limit
    ),
    -- Categories are unscoped for buyers: this schema has no brand -> category
    -- join, so "categories containing an allowed brand's products" would need
    -- a new derived query. Not built here; buyers see the same category rows
    -- a seller would.
    category_matches AS MATERIALIZED (
      SELECT
        'category'::text AS entity_type,
        tc.id,
        tc.name AS label,
        concat_ws(
          ' · ',
          NULLIF(COALESCE(tc.description, ''), ''),
          NULLIF(COALESCE(mc.name, ''), ''),
          CASE WHEN tc.is_active THEN 'Active' ELSE 'Inactive' END
        ) AS sublabel,
        '/categories/' || tc.id::text AS url_path,
        CASE
          WHEN tc.search_vector @@ v_ts_query
            THEN 2.0 + ts_rank_cd(tc.search_vector, v_ts_query)::double precision
          ELSE ts_rank_cd(tc.search_vector, v_prefix_ts_query)::double precision
        END AS rank
      FROM app.tenant_categories tc
      LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
      WHERE tc.tenant_id = p_tenant_id
        AND tc.deleted_at IS NULL
        AND (
          tc.search_vector @@ v_ts_query
          OR (v_prefix_ts_query IS NOT NULL AND tc.search_vector @@ v_prefix_ts_query)
        )
      ORDER BY rank DESC, 3 ASC, tc.id ASC
      LIMIT v_limit
    ),
    all_matches AS (
      SELECT *, 1 AS group_order FROM product_matches
      UNION ALL SELECT *, 2 FROM brand_matches
      UNION ALL SELECT *, 3 FROM category_matches
    )
    SELECT
      matches.entity_type,
      matches.id,
      matches.label,
      matches.sublabel,
      matches.url_path
    FROM all_matches matches
    ORDER BY matches.group_order, matches.rank DESC, matches.label ASC, matches.id ASC;

    RETURN;
  END IF;

  RETURN QUERY
  WITH product_matches AS MATERIALIZED (
    SELECT
      'product'::text AS entity_type,
      sp.tenant_product_id AS id,
      sp.product_name AS label,
      concat_ws(' · ', sp.brand_name, sp.category_name, sp.sku) AS sublabel,
      '/products/' || sp.tenant_product_id::text AS url_path,
      sp.search_rank AS rank
    FROM app.search_products_scoped(
      p_tenant_id := p_tenant_id,
      p_query := v_query,
      p_limit := v_limit,
      p_offset := 0,
      p_sort := 'relevance',
      p_include_inventory := false
    ) sp
    ORDER BY sp.search_rank DESC, sp.product_name ASC, sp.tenant_product_id ASC
    LIMIT v_limit
  ),
  brand_matches AS MATERIALIZED (
    SELECT
      'brand'::text AS entity_type,
      tb.id,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS label,
      COALESCE(tb.description_override, tb.description, cb.description, '') AS sublabel,
      '/brands/' || tb.id::text AS url_path,
      CASE
        WHEN tb.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(tb.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(tb.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.tenant_brands tb
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.tenant_id = p_tenant_id
      AND tb.is_active = true
      AND tb.deleted_at IS NULL
      AND (
        tb.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND tb.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, tb.id ASC
    LIMIT v_limit
  ),
  category_matches AS MATERIALIZED (
    SELECT
      'category'::text AS entity_type,
      tc.id,
      tc.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(tc.description, ''), ''),
        NULLIF(COALESCE(mc.name, ''), ''),
        CASE WHEN tc.is_active THEN 'Active' ELSE 'Inactive' END
      ) AS sublabel,
      '/categories/' || tc.id::text AS url_path,
      CASE
        WHEN tc.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(tc.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(tc.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.tenant_categories tc
    LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND (
        tc.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND tc.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, tc.id ASC
    LIMIT v_limit
  ),
  -- CHANGED: the v_is_assistant EXISTS block against orders/invoices/estimates
  -- has been removed. Customers are now unscoped for seller_admin AND
  -- seller_assistant.
  customer_matches AS MATERIALIZED (
    SELECT
      'customer'::text AS entity_type,
      b.id,
      b.business_name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(b.contact_name, ''), ''),
        NULLIF(COALESCE(b.geography->>'city', ''), ''),
        NULLIF(COALESCE(b.phone, ''), '')
      ) AS sublabel,
      '/customers/' || b.id::text AS url_path,
      CASE
        WHEN b.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(b.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(b.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND (
        b.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND b.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, b.id ASC
    LIMIT v_limit
  ),
  cohort_matches AS MATERIALIZED (
    SELECT
      'cohort'::text AS entity_type,
      c.id,
      c.name AS label,
      COALESCE(c.description, '') AS sublabel,
      '/customer-groups/' || c.id::text AS url_path,
      CASE
        WHEN c.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(c.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(c.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (
        c.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND c.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, c.id ASC
    LIMIT v_limit
  ),
  campaign_matches AS MATERIALIZED (
    SELECT
      'campaign'::text AS entity_type,
      c.id,
      c.name AS label,
      COALESCE(c.status, '') AS sublabel,
      '/campaigns/' || c.id::text AS url_path,
      CASE
        WHEN c.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(c.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(c.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.campaigns c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (
        c.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND c.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, c.id ASC
    LIMIT v_limit
  ),
  price_list_matches AS MATERIALIZED (
    SELECT
      'price_list'::text AS entity_type,
      pl.id,
      pl.name AS label,
      COALESCE(pl.description, '') AS sublabel,
      '/price-lists/' || pl.id::text AS url_path,
      CASE
        WHEN pl.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(pl.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(pl.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.price_lists pl
    WHERE pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
      AND (
        pl.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND pl.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, pl.id ASC
    LIMIT v_limit
  ),
  order_matches AS MATERIALIZED (
    SELECT
      'order'::text AS entity_type,
      o.id,
      o.order_number AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/sales-orders/' || o.id::text AS url_path,
      CASE
        WHEN lower(o.order_number) = lower(v_query) THEN 3.0
        WHEN lower(o.order_number) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(o.order_number), lower(v_query))::double precision
      END AS rank
    FROM app.orders o
    LEFT JOIN app.buyers b ON b.id = o.buyer_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND (NOT v_is_assistant OR o.location_id = ANY (v_location_ids))
      AND (
        lower(o.order_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(o.order_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, o.id ASC
    LIMIT v_limit
  ),
  invoice_matches AS MATERIALIZED (
    SELECT
      'invoice'::text AS entity_type,
      i.id,
      i.invoice_number AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/invoices/' || i.id::text AS url_path,
      CASE
        WHEN lower(i.invoice_number) = lower(v_query) THEN 3.0
        WHEN lower(i.invoice_number) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(i.invoice_number), lower(v_query))::double precision
      END AS rank
    FROM app.invoices i
    LEFT JOIN app.buyers b ON b.id = i.buyer_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND (NOT v_is_assistant OR i.location_id = ANY (v_location_ids))
      AND (
        lower(i.invoice_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(i.invoice_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, i.id ASC
    LIMIT v_limit
  ),
  estimate_matches AS MATERIALIZED (
    SELECT
      'estimate'::text AS entity_type,
      e.id,
      COALESCE(e.estimate_number, '') AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/estimates/' || e.id::text AS url_path,
      CASE
        WHEN lower(COALESCE(e.estimate_number, '')) = lower(v_query) THEN 3.0
        WHEN lower(COALESCE(e.estimate_number, '')) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(COALESCE(e.estimate_number, '')), lower(v_query))::double precision
      END AS rank
    FROM app.estimates e
    LEFT JOIN app.buyers b ON b.id = e.buyer_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.estimate_number IS NOT NULL
      AND (NOT v_is_assistant OR e.location_id = ANY (v_location_ids))
      AND (
        lower(e.estimate_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(e.estimate_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, e.id ASC
    LIMIT v_limit
  ),
  location_matches AS MATERIALIZED (
    SELECT
      'location'::text AS entity_type,
      l.id,
      l.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(l.address->>'city', ''), ''),
        NULLIF(COALESCE(l.address->>'state', ''), '')
      ) AS sublabel,
      '/locations/' || l.id::text AS url_path,
      CASE
        WHEN l.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(l.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(l.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (NOT v_is_assistant OR l.id = ANY (v_location_ids))
      AND (
        l.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND l.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, l.id ASC
    LIMIT v_limit
  ),
  warehouse_matches AS MATERIALIZED (
    SELECT
      'warehouse'::text AS entity_type,
      w.id,
      w.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(w.address->>'city', ''), ''),
        NULLIF(COALESCE(w.address->>'state', ''), '')
      ) AS sublabel,
      '/warehouses/' || w.id::text AS url_path,
      CASE
        WHEN w.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(w.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(w.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (NOT v_is_assistant OR w.location_id = ANY (v_location_ids))
      AND (
        w.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND w.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, w.id ASC
    LIMIT v_limit
  ),
  all_matches AS (
    SELECT *, 1 AS group_order FROM product_matches
    UNION ALL SELECT *, 2 FROM brand_matches
    UNION ALL SELECT *, 3 FROM category_matches
    UNION ALL SELECT *, 4 FROM customer_matches
    UNION ALL SELECT *, 5 FROM cohort_matches
    UNION ALL SELECT *, 6 FROM campaign_matches
    UNION ALL SELECT *, 7 FROM price_list_matches
    UNION ALL SELECT *, 8 FROM order_matches
    UNION ALL SELECT *, 9 FROM invoice_matches
    UNION ALL SELECT *, 10 FROM estimate_matches
    UNION ALL SELECT *, 11 FROM location_matches
    UNION ALL SELECT *, 12 FROM warehouse_matches
  )
  SELECT
    matches.entity_type,
    matches.id,
    matches.label,
    matches.sublabel,
    matches.url_path
  FROM all_matches matches
  ORDER BY matches.group_order, matches.rank DESC, matches.label ASC, matches.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION app.global_search(text, uuid, text, integer, uuid[], uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.global_search(text, uuid, text, integer, uuid[], uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.global_search(text, uuid, text, integer, uuid[], uuid, uuid[]) TO service_role;
