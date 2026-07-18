-- Bounded, filter-first resultset seams for seller entity landing pages.

CREATE OR REPLACE FUNCTION app.search_seller_brand_landing_ids(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_cohort_ids uuid[] DEFAULT NULL,
  p_allowed_brand_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, catalog
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_prefix_text text;
  v_categories text[] := ARRAY(SELECT lower(btrim(value)) FROM unnest(COALESCE(p_category_names, ARRAY[]::text[])) AS value WHERE btrim(value) <> '');
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
      tb.id,
      CASE WHEN v_query IS NULL THEN 0::real ELSE GREATEST(
        ts_rank_cd(tb.search_vector, v_ts_query),
        COALESCE(ts_rank_cd(tb.search_vector, v_prefix_ts_query), 0)
      ) END AS search_rank,
      tb.created_at
    FROM app.tenant_brands tb
    WHERE tb.tenant_id = p_tenant_id
      AND tb.deleted_at IS NULL
      AND tb.is_active = true
      AND (p_allowed_brand_ids IS NULL OR tb.id = ANY(p_allowed_brand_ids))
      AND (COALESCE(cardinality(p_cohort_ids), 0) = 0 OR tb.default_cohort_id = ANY(p_cohort_ids))
      AND (v_query IS NULL OR tb.search_vector @@ v_ts_query OR tb.search_vector @@ v_prefix_ts_query)
      AND (
        cardinality(v_categories) = 0
        OR EXISTS (
          SELECT 1
          FROM app.tenant_products tp
          LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id AND tc.deleted_at IS NULL
          LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id AND cp.deleted_at IS NULL
          LEFT JOIN catalog.categories cc ON cc.id = cp.category_id AND cc.deleted_at IS NULL
          WHERE tp.tenant_id = p_tenant_id
            AND tp.tenant_brand_id = tb.id
            AND tp.deleted_at IS NULL
            AND tp.is_active = true
            AND (lower(tc.name) = ANY(v_categories) OR lower(cc.name) = ANY(v_categories))
        )
      )
  ), totals AS MATERIALIZED (
    SELECT count(*) AS total_count FROM candidates
  ), page AS MATERIALIZED (
    SELECT candidates.id, candidates.search_rank, candidates.created_at
    FROM candidates
    ORDER BY candidates.search_rank DESC, candidates.created_at DESC, candidates.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT page.id, totals.total_count
  FROM totals
  LEFT JOIN page ON true
  ORDER BY page.search_rank DESC, page.created_at DESC, page.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.search_seller_category_landing_ids(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_product_mode text DEFAULT 'all',
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
  v_product_mode text := CASE WHEN p_product_mode IN ('has_products', 'empty') THEN p_product_mode ELSE 'all' END;
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
      tc.id,
      CASE WHEN v_query IS NULL THEN 0::real ELSE GREATEST(
        ts_rank_cd(tc.search_vector, v_ts_query),
        COALESCE(ts_rank_cd(tc.search_vector, v_prefix_ts_query), 0)
      ) END AS search_rank,
      tc.name
    FROM app.tenant_categories tc
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND (cardinality(v_statuses) = 0 OR (CASE WHEN tc.is_active THEN 'active' ELSE 'inactive' END) = ANY(v_statuses))
      AND (v_query IS NULL OR tc.search_vector @@ v_ts_query OR tc.search_vector @@ v_prefix_ts_query)
      AND (
        v_product_mode = 'all'
        OR (v_product_mode = 'has_products') = EXISTS (
          SELECT 1 FROM app.tenant_products tp
          WHERE tp.tenant_id = p_tenant_id
            AND tp.tenant_category_id = tc.id
            AND tp.deleted_at IS NULL
            AND tp.is_active = true
        )
      )
  ), totals AS MATERIALIZED (
    SELECT count(*) AS total_count FROM candidates
  ), page AS MATERIALIZED (
    SELECT candidates.id, candidates.search_rank, candidates.name
    FROM candidates
    ORDER BY candidates.search_rank DESC, candidates.name, candidates.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT page.id, totals.total_count
  FROM totals
  LEFT JOIN page ON true
  ORDER BY page.search_rank DESC, page.name, page.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.search_seller_location_landing_ids(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_stock_modes text[] DEFAULT NULL,
  p_dues_modes text[] DEFAULT NULL,
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
    INTO v_prefix_text FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
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
    LEFT JOIN app.locations_snapshot ls ON ls.location_id = l.id AND ls.tenant_id = p_tenant_id
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (cardinality(v_statuses) = 0 OR lower(COALESCE(l.status, 'active')) = ANY(v_statuses))
      AND (v_query IS NULL OR l.search_vector @@ v_ts_query OR l.search_vector @@ v_prefix_ts_query)
      AND (
        cardinality(v_stock) = 0 OR cardinality(v_stock) >= 3
        OR ('In Stock' = ANY(v_stock) AND COALESCE(ls.oos_sku_count, 0) = 0 AND COALESCE(ls.low_stock_sku_count, 0) = 0)
        OR ('Low Stock' = ANY(v_stock) AND COALESCE(ls.oos_sku_count, 0) = 0 AND COALESCE(ls.low_stock_sku_count, 0) > 0)
        OR ('Out of Stock' = ANY(v_stock) AND COALESCE(ls.oos_sku_count, 0) > 0)
      )
      AND (
        cardinality(v_dues) = 0
        OR ('Due' = ANY(v_dues) AND COALESCE(ls.outstanding_dues, 0) > 0)
        OR ('Overdue' = ANY(v_dues) AND COALESCE(ls.outstanding_dues, 0) > 0 AND COALESCE(ls.oldest_unpaid_days, 0) > 30)
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
    INTO v_prefix_text FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
    IF v_prefix_text IS NOT NULL THEN v_prefix_ts_query := to_tsquery('english', v_prefix_text); END IF;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT
      w.id,
      CASE WHEN v_query IS NULL THEN 0::real ELSE GREATEST(
        ts_rank_cd(w.search_vector, v_ts_query), COALESCE(ts_rank_cd(w.search_vector, v_prefix_ts_query), 0)
      ) END AS search_rank,
      w.is_default,
      w.created_at
    FROM app.warehouses w
    LEFT JOIN app.warehouses_snapshot ws ON ws.warehouse_id = w.id AND ws.tenant_id = p_tenant_id
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (p_location_ids IS NULL OR w.location_id = ANY(p_location_ids))
      AND (cardinality(v_statuses) = 0 OR lower(w.status) = ANY(v_statuses))
      AND (v_query IS NULL OR w.search_vector @@ v_ts_query OR w.search_vector @@ v_prefix_ts_query)
      AND (
        cardinality(v_stock) = 0 OR cardinality(v_stock) >= 3
        OR ('In Stock' = ANY(v_stock) AND COALESCE(ws.stockout_skus, 0) = 0 AND COALESCE(ws.low_stock_skus, 0) = 0)
        OR ('Low Stock' = ANY(v_stock) AND COALESCE(ws.stockout_skus, 0) = 0 AND COALESCE(ws.low_stock_skus, 0) > 0)
        OR ('Out of Stock' = ANY(v_stock) AND COALESCE(ws.stockout_skus, 0) > 0)
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

REVOKE ALL ON FUNCTION app.search_seller_brand_landing_ids(uuid, text, text[], uuid[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_seller_category_landing_ids(uuid, text, text[], text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_seller_location_landing_ids(uuid, text, text[], text[], text[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_seller_warehouse_landing_ids(uuid, text, text[], text[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.search_seller_brand_landing_ids(uuid, text, text[], uuid[], uuid[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_seller_category_landing_ids(uuid, text, text[], text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_seller_location_landing_ids(uuid, text, text[], text[], text[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_seller_warehouse_landing_ids(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;
