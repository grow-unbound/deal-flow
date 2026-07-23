-- Shared "live count" preview for the fixed-bucket automatic-membership rule shapes (requirement
-- 5/6: same filter component shows a live count before save, in both the Create/Edit overlay
-- and the Details tab). Unlike the old app.preview_cohort_count, the new rule shape has a
-- small fixed key set, so this is plain static SQL, not dynamic EXECUTE.
--
-- Buyer rules (cohorts, campaign-buyers): { last_sale_bucket?, sales_90d_level?, buyer_app_status? }
-- Product rules (price_lists, campaign-products): { brand_names?, category_names?, stock_status? }

CREATE OR REPLACE FUNCTION "app"."preview_buyer_membership_count"("p_tenant_id" "uuid", "p_rules" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_count        integer := 0;
  v_sample_names text[]  := '{}';
BEGIN
  WITH buyer_buckets AS (
    SELECT
      b.id,
      b.business_name,
      app.derive_last_order_bucket_v2(m.last_order_at) AS last_sale_bucket,
      app.derive_sales_90d_level(m.gmv_90d)            AS sales_90d_level,
      app.derive_buyer_app_status(b.is_active, b.buyer_app_enabled) AS buyer_app_status
    FROM app.buyers b
    LEFT JOIN LATERAL (
      SELECT
        MAX(o.placed_at) AS last_order_at,
        COALESCE(SUM(CASE WHEN o.placed_at >= now() - INTERVAL '90 days' THEN o.total_amount ELSE 0 END), 0) AS gmv_90d
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL AND o.status != 'cancelled'
    ) m ON true
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
  ),
  matched AS (
    SELECT * FROM buyer_buckets bb
    WHERE (NOT (p_rules ? 'last_sale_bucket') OR bb.last_sale_bucket = p_rules ->> 'last_sale_bucket')
      AND (NOT (p_rules ? 'sales_90d_level') OR bb.sales_90d_level = p_rules ->> 'sales_90d_level')
      AND (NOT (p_rules ? 'buyer_app_status') OR bb.buyer_app_status = p_rules ->> 'buyer_app_status')
  )
  SELECT COUNT(*), (SELECT array_agg(business_name ORDER BY business_name) FROM (SELECT business_name FROM matched ORDER BY business_name LIMIT 5) sub)
  INTO v_count, v_sample_names
  FROM matched;

  RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
END;
$$;

ALTER FUNCTION "app"."preview_buyer_membership_count"("uuid", "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."preview_product_membership_count"("p_tenant_id" "uuid", "p_rules" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_count         integer := 0;
  v_sample_names  text[]  := '{}';
  v_brand_names   text[];
  v_category_names text[];
BEGIN
  SELECT array_agg(lower(x)) INTO v_brand_names
  FROM jsonb_array_elements_text(COALESCE(p_rules -> 'brand_names', '[]'::jsonb)) x;
  SELECT array_agg(lower(x)) INTO v_category_names
  FROM jsonb_array_elements_text(COALESCE(p_rules -> 'category_names', '[]'::jsonb)) x;

  WITH product_buckets AS (
    SELECT
      tp.id,
      COALESCE(tp.name_override, 'Unnamed product') AS product_name,
      lower(COALESCE(tb.display_name_override, b.name, '')) AS brand_name,
      lower(COALESCE(tc.name, '')) AS category_name,
      app.derive_stock_status_bucket(ti.qty_available, ti.reorder_point, app.product_is_new_stock_today(tp.id)) AS stock_status
    FROM app.tenant_products tp
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
    LEFT JOIN LATERAL (
      SELECT ti.qty_available, ti.reorder_point
      FROM app.tenant_inventory ti
      WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
      ORDER BY ti.updated_at DESC
      LIMIT 1
    ) ti ON true
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
  ),
  matched AS (
    SELECT * FROM product_buckets pb
    WHERE (v_brand_names IS NULL OR array_length(v_brand_names, 1) IS NULL OR pb.brand_name = ANY (v_brand_names))
      AND (v_category_names IS NULL OR array_length(v_category_names, 1) IS NULL OR pb.category_name = ANY (v_category_names))
      AND (NOT (p_rules ? 'stock_status') OR pb.stock_status = p_rules ->> 'stock_status')
  )
  SELECT COUNT(*), (SELECT array_agg(product_name ORDER BY product_name) FROM (SELECT product_name FROM matched ORDER BY product_name LIMIT 5) sub)
  INTO v_count, v_sample_names
  FROM matched;

  RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
END;
$$;

ALTER FUNCTION "app"."preview_product_membership_count"("uuid", "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."preview_membership_count"("p_tenant_id" "uuid", "p_entity_type" "text", "p_rules" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
BEGIN
  IF p_entity_type IN ('cohort', 'campaign_buyers') THEN
    RETURN app.preview_buyer_membership_count(p_tenant_id, COALESCE(p_rules, '{}'::jsonb));
  ELSIF p_entity_type IN ('price_list', 'campaign_products') THEN
    RETURN app.preview_product_membership_count(p_tenant_id, COALESCE(p_rules, '{}'::jsonb));
  ELSE
    RAISE EXCEPTION 'Unknown membership entity_type: %', p_entity_type;
  END IF;
END;
$$;

ALTER FUNCTION "app"."preview_membership_count"("uuid", "text", "jsonb") OWNER TO "postgres";

GRANT ALL ON FUNCTION "app"."preview_buyer_membership_count"("uuid", "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "app"."preview_product_membership_count"("uuid", "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "app"."preview_membership_count"("uuid", "text", "jsonb") TO "service_role";
