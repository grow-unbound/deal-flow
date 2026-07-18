CREATE OR REPLACE FUNCTION catalog.search_available_products_for_tenant(
  p_tenant_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  master_sku text,
  brand_id uuid,
  gst_rate numeric,
  hsn_code text,
  default_uom text,
  pack_size numeric,
  description text,
  image_urls text[],
  brand_name text,
  brand_slug text,
  brand_logo_url text,
  category_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, catalog, app, public
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_text text;
  v_prefix_query tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);
    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
    IF v_prefix_text IS NOT NULL THEN
      v_prefix_query := to_tsquery('english', v_prefix_text);
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    cp.id,
    cp.name,
    cp.master_sku,
    cp.brand_id,
    cp.gst_rate,
    cp.hsn_code,
    cp.default_uom,
    cp.pack_size,
    cp.description,
    cp.image_urls,
    cb.name,
    cb.slug,
    cb.logo_url,
    cc.name
  FROM catalog.products cp
  JOIN catalog.brands cb
    ON cb.id = cp.brand_id
   AND cb.is_public = true
   AND cb.deleted_at IS NULL
  LEFT JOIN catalog.categories cc
    ON cc.id = cp.category_id
   AND cc.deleted_at IS NULL
  WHERE cp.is_public = true
    AND cp.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM app.tenant_products tp
      WHERE tp.tenant_id = p_tenant_id
        AND tp.master_product_id = cp.id
        AND tp.deleted_at IS NULL
    )
    AND (
      v_query IS NULL
      OR cp.search_doc @@ v_ts_query
      OR (v_prefix_query IS NOT NULL AND cp.search_doc @@ v_prefix_query)
    )
  ORDER BY
    CASE WHEN v_query IS NULL THEN 0 ELSE ts_rank_cd(cp.search_doc, v_ts_query) END DESC,
    cp.name ASC,
    cp.id ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION catalog.search_available_products_for_tenant(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.search_available_products_for_tenant(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION catalog.search_available_products_for_tenant(uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION catalog.search_available_brands_for_tenant(
  p_tenant_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  logo_url text,
  description text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  SELECT cb.id, cb.name, cb.slug, cb.logo_url, cb.description
  FROM catalog.brands cb
  WHERE p_tenant_id IS NOT NULL
    AND cb.is_public = true
    AND cb.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM app.tenant_brands tb
      WHERE tb.tenant_id = p_tenant_id
        AND tb.master_brand_id = cb.id
        AND tb.deleted_at IS NULL
    )
    AND (
      NULLIF(btrim(p_query), '') IS NULL
      OR lower(cb.name) LIKE '%' || lower(btrim(p_query)) || '%'
      OR lower(cb.slug) LIKE '%' || lower(btrim(p_query)) || '%'
    )
  ORDER BY
    CASE WHEN lower(cb.name) = lower(btrim(p_query)) THEN 0 ELSE 1 END,
    cb.name ASC,
    cb.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION catalog.search_available_brands_for_tenant(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.search_available_brands_for_tenant(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION catalog.search_available_brands_for_tenant(uuid, text, integer) TO service_role;
