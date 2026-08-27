-- Resolve product display data (name, sku, brand, category, images) for a
-- batch of tenant_product_ids. Used by the Buyer App dashboard's PostHog
-- "products viewed" / "products added to cart" cards, which only get raw
-- tenant_product_id values back from PostHog event properties and had no
-- way to render a product name/sku/brand/category/image before this.
-- Mirrors the name/brand/category join pattern already used by
-- app.search_products.
CREATE OR REPLACE FUNCTION app.get_tenant_products_summary(
  p_tenant_id uuid,
  p_tenant_product_ids uuid[]
)
RETURNS TABLE (
  tenant_product_id uuid,
  product_name text,
  sku text,
  brand_name text,
  category_name text,
  image_urls text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog
AS $$
  SELECT
    tp.id AS tenant_product_id,
    COALESCE(tp.name_override, cp.name, tp.internal_sku) AS product_name,
    tp.internal_sku AS sku,
    COALESCE(tb.display_name_override, cb.name, 'Brand') AS brand_name,
    COALESCE(tc.name, '') AS category_name,
    tp.image_urls
  FROM app.tenant_products tp
  LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
  LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
  WHERE tp.tenant_id = p_tenant_id
    AND tp.deleted_at IS NULL
    AND tp.id = ANY(p_tenant_product_ids)
$$;

ALTER FUNCTION app.get_tenant_products_summary(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.get_tenant_products_summary(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_tenant_products_summary(uuid, uuid[]) TO service_role;
