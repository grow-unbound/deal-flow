-- Production hotfix: campaign/price-list product preview counts must match
-- automatic membership semantics by excluding inactive products.

CREATE OR REPLACE FUNCTION app.preview_product_membership_count(p_tenant_id uuid, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_rules jsonb := app.membership_normalize_product_rules(p_rules);
  v_count integer := 0;
  v_sample_names text[] := '{}';
BEGIN
  WITH scoped AS (
    SELECT
      tp.id,
      COALESCE(tp.name_override, tp.internal_sku, 'Unnamed product') AS product_name,
      app.derive_stock_status_bucket(ti.qty_available, ti.reorder_point, app.product_is_new_stock_today(tp.id)) AS stock_status,
      app.membership_product_sold_this_quarter(p_tenant_id, tp.id) AS sold_this_quarter,
      tp.tenant_brand_id,
      COALESCE(tb.display_name_override, b.name) AS brand_name,
      tp.tenant_category_id,
      tc.name AS category_name
    FROM app.tenant_products tp
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
    LEFT JOIN LATERAL (
      SELECT qty_available, reorder_point
      FROM app.tenant_inventory
      WHERE tenant_product_id = tp.id AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    ) ti ON true
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND COALESCE(tp.is_active, true)
  ), matched AS (
    SELECT *
    FROM scoped s
    WHERE app.membership_text_filter_matches(v_rules -> 'brand_names', s.tenant_brand_id::text, s.brand_name)
      AND app.membership_text_filter_matches(v_rules -> 'category_names', s.tenant_category_id::text, s.category_name)
      AND (NOT (v_rules ? 'stock_status') OR s.stock_status = v_rules ->> 'stock_status')
      AND (NOT (v_rules ? 'sales_status_this_quarter')
        OR (v_rules ->> 'sales_status_this_quarter' = 'sold' AND s.sold_this_quarter)
        OR (v_rules ->> 'sales_status_this_quarter' = 'not_sold' AND NOT s.sold_this_quarter))
  )
  SELECT COUNT(*), (SELECT array_agg(product_name ORDER BY product_name) FROM (SELECT product_name FROM matched ORDER BY product_name LIMIT 5) sample)
  INTO v_count, v_sample_names
  FROM matched;

  RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
END;
$$;

GRANT EXECUTE ON FUNCTION app.preview_product_membership_count(uuid, jsonb) TO service_role;
