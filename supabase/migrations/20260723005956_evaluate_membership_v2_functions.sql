-- v2 automatic-membership evaluators. Fixed single-value bucket filters replace the old
-- open-ended field/operator/value rule shapes. Original v1 functions
-- (evaluate_buyer_for_cohorts, evaluate_product_for_campaigns, evaluate_product_for_price_lists)
-- are left untouched for now (deprecated, not yet dropped); only the v2 functions below are
-- wired into trigger paths (see the companion cutover migration).
--
-- Fixed rule shapes (all keys optional; present keys are ANDed):
--   buyer rules   (cohorts.rules, campaigns.buyer_filter_rules):
--     { "last_sale_bucket": "within_30_days"|"within_90_days"|"dormant_90_plus_days"|"never_ordered",
--       "sales_90d_level":  "none"|"low"|"medium"|"high",
--       "buyer_app_status": "enabled"|"not_enabled"|"inactive" }
--   product rules (price_lists.filters, campaigns.dynamic_rules):
--     { "brand_names": [...], "category_names": [...],
--       "stock_status": "new_stock"|"in_stock"|"low_stock"|"out_of_stock" }
--
-- Dropped vs. v1: cohorts' geography.city clause and excluded_buyer_ids override are not in
-- the new fixed filter list, so v2 does not evaluate them. Product filters drop
-- last_ordered_bucket/gmv_90d_bucket (buyer concepts that had bled into product filters).
-- These are intentional narrowings per the new spec, not oversights.

CREATE OR REPLACE FUNCTION "app"."evaluate_buyer_for_cohorts_v2"("p_buyer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id         uuid;
  v_is_active         boolean;
  v_buyer_app_enabled boolean;
  v_last_order_at     timestamptz;
  v_gmv_90d           numeric;
  v_last_sale_bucket  text;
  v_sales_90d_level   text;
  v_buyer_app_status  text;
  v_cohort            record;
  v_rules             jsonb;
  v_matches           boolean;
  v_now               timestamptz := now();
BEGIN
  SELECT tenant_id, is_active, buyer_app_enabled
  INTO v_tenant_id, v_is_active, v_buyer_app_enabled
  FROM app.buyers
  WHERE id = p_buyer_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    MAX(o.placed_at),
    COALESCE(SUM(CASE WHEN o.placed_at >= v_now - INTERVAL '90 days' THEN o.total_amount ELSE 0 END), 0)
  INTO v_last_order_at, v_gmv_90d
  FROM app.orders o
  WHERE o.tenant_id = v_tenant_id
    AND o.buyer_id  = p_buyer_id
    AND o.deleted_at IS NULL
    AND o.status   != 'cancelled';

  v_last_sale_bucket := app.derive_last_order_bucket_v2(v_last_order_at);
  v_sales_90d_level  := app.derive_sales_90d_level(v_gmv_90d);
  v_buyer_app_status := app.derive_buyer_app_status(v_is_active, v_buyer_app_enabled);

  FOR v_cohort IN
    SELECT id, rules
    FROM app.cohorts
    WHERE tenant_id = v_tenant_id
      AND membership_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules   := COALESCE(v_cohort.rules, '{}'::jsonb);
    v_matches := true;

    IF v_rules ? 'last_sale_bucket' AND v_rules ->> 'last_sale_bucket' != v_last_sale_bucket THEN
      v_matches := false;
    END IF;

    IF v_matches AND v_rules ? 'sales_90d_level' AND v_rules ->> 'sales_90d_level' != v_sales_90d_level THEN
      v_matches := false;
    END IF;

    IF v_matches AND v_rules ? 'buyer_app_status' AND v_rules ->> 'buyer_app_status' != v_buyer_app_status THEN
      v_matches := false;
    END IF;

    IF v_matches THEN
      -- Open a new membership window only if no active row already exists for this pair.
      INSERT INTO app.cohort_members (cohort_id, buyer_id, valid_from)
      SELECT v_cohort.id, p_buyer_id, v_now
      WHERE NOT EXISTS (
        SELECT 1 FROM app.cohort_members
        WHERE cohort_id = v_cohort.id AND buyer_id = p_buyer_id AND valid_until IS NULL
      );
    ELSE
      UPDATE app.cohort_members
      SET valid_until = v_now
      WHERE cohort_id = v_cohort.id AND buyer_id = p_buyer_id AND valid_until IS NULL;
    END IF;
  END LOOP;

  UPDATE app.cohorts c
  SET
    cached_member_count = (SELECT COUNT(*) FROM app.cohort_members_active WHERE cohort_id = c.id),
    last_refreshed_at   = v_now
  WHERE c.tenant_id       = v_tenant_id
    AND c.membership_mode = 'automatic'
    AND c.deleted_at IS NULL;
END;
$$;

ALTER FUNCTION "app"."evaluate_buyer_for_cohorts_v2"("uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."evaluate_buyer_for_campaign_buyers"("p_buyer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id         uuid;
  v_is_active         boolean;
  v_buyer_app_enabled boolean;
  v_last_order_at     timestamptz;
  v_gmv_90d           numeric;
  v_last_sale_bucket  text;
  v_sales_90d_level   text;
  v_buyer_app_status  text;
  v_campaign          record;
  v_rules             jsonb;
  v_matches           boolean;
  v_now               timestamptz := now();
BEGIN
  SELECT tenant_id, is_active, buyer_app_enabled
  INTO v_tenant_id, v_is_active, v_buyer_app_enabled
  FROM app.buyers
  WHERE id = p_buyer_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    MAX(o.placed_at),
    COALESCE(SUM(CASE WHEN o.placed_at >= v_now - INTERVAL '90 days' THEN o.total_amount ELSE 0 END), 0)
  INTO v_last_order_at, v_gmv_90d
  FROM app.orders o
  WHERE o.tenant_id = v_tenant_id
    AND o.buyer_id  = p_buyer_id
    AND o.deleted_at IS NULL
    AND o.status   != 'cancelled';

  v_last_sale_bucket := app.derive_last_order_bucket_v2(v_last_order_at);
  v_sales_90d_level  := app.derive_sales_90d_level(v_gmv_90d);
  v_buyer_app_status := app.derive_buyer_app_status(v_is_active, v_buyer_app_enabled);

  -- buyer_target_mode = 'customer_group' is intentionally excluded: that audience is read
  -- live through cohort_members via target_cohort_id and is never materialized here.
  FOR v_campaign IN
    SELECT id, buyer_filter_rules
    FROM app.campaigns
    WHERE tenant_id = v_tenant_id
      AND buyer_target_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules   := COALESCE(v_campaign.buyer_filter_rules, '{}'::jsonb);
    v_matches := true;

    IF v_rules ? 'last_sale_bucket' AND v_rules ->> 'last_sale_bucket' != v_last_sale_bucket THEN
      v_matches := false;
    END IF;

    IF v_matches AND v_rules ? 'sales_90d_level' AND v_rules ->> 'sales_90d_level' != v_sales_90d_level THEN
      v_matches := false;
    END IF;

    IF v_matches AND v_rules ? 'buyer_app_status' AND v_rules ->> 'buyer_app_status' != v_buyer_app_status THEN
      v_matches := false;
    END IF;

    IF v_matches THEN
      INSERT INTO app.campaign_buyer_members (campaign_id, buyer_id, valid_from)
      SELECT v_campaign.id, p_buyer_id, v_now
      WHERE NOT EXISTS (
        SELECT 1 FROM app.campaign_buyer_members
        WHERE campaign_id = v_campaign.id AND buyer_id = p_buyer_id AND valid_until IS NULL
      );
    ELSE
      UPDATE app.campaign_buyer_members
      SET valid_until = v_now
      WHERE campaign_id = v_campaign.id AND buyer_id = p_buyer_id AND valid_until IS NULL;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."evaluate_buyer_for_campaign_buyers"("uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."evaluate_product_for_price_lists_v2"("p_tenant_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id         uuid;
  v_brand_name        text;
  v_category_name     text;
  v_base_price        numeric;
  v_mrp               numeric;
  v_qty_available     numeric;
  v_reorder_point     numeric;
  v_is_new_in_stock   boolean;
  v_stock_status      text;
  v_price_list        record;
  v_filters           jsonb;
  v_brand_names       text[];
  v_category_names    text[];
  v_stock_filter      text;
  v_matches           boolean;
  v_computed_price    numeric;
  v_now               timestamptz := now();
BEGIN
  SELECT
    tp.tenant_id,
    COALESCE(tb.display_name_override, b.name),
    tc.name,
    tp.base_selling_price, tp.mrp
  INTO v_tenant_id, v_brand_name, v_category_name, v_base_price, v_mrp
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
  LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
  WHERE tp.id = p_tenant_product_id AND tp.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT ti.qty_available, ti.reorder_point
  INTO v_qty_available, v_reorder_point
  FROM app.tenant_inventory ti
  WHERE ti.tenant_product_id = p_tenant_product_id
    AND ti.deleted_at IS NULL
  ORDER BY ti.updated_at DESC
  LIMIT 1;

  v_is_new_in_stock := app.product_is_new_stock_today(p_tenant_product_id);
  v_stock_status    := app.derive_stock_status_bucket(v_qty_available, v_reorder_point, v_is_new_in_stock);

  FOR v_price_list IN
    SELECT pl.id, pl.filters, pl.pricing_strategy, pl.strategy_value
    FROM app.price_lists pl
    WHERE pl.tenant_id = v_tenant_id
      AND pl.membership_mode = 'automatic'
      AND pl.deleted_at IS NULL
  LOOP
    IF v_price_list.pricing_strategy = 'edit_each' THEN
      CONTINUE;
    END IF;

    v_filters := COALESCE(v_price_list.filters, '{}'::jsonb);
    v_matches := true;

    SELECT array_agg(x) INTO v_brand_names
    FROM jsonb_array_elements_text(COALESCE(v_filters -> 'brand_names', '[]'::jsonb)) x;

    IF v_brand_names IS NOT NULL AND array_length(v_brand_names, 1) > 0 THEN
      IF NOT (lower(COALESCE(v_brand_name, '')) = ANY (SELECT lower(unnest(v_brand_names)))) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches THEN
      SELECT array_agg(x) INTO v_category_names
      FROM jsonb_array_elements_text(COALESCE(v_filters -> 'category_names', '[]'::jsonb)) x;

      IF v_category_names IS NOT NULL AND array_length(v_category_names, 1) > 0 THEN
        IF NOT (lower(COALESCE(v_category_name, '')) = ANY (SELECT lower(unnest(v_category_names)))) THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    IF v_matches THEN
      v_stock_filter := v_filters ->> 'stock_status';
      IF v_stock_filter IS NOT NULL AND v_stock_filter != v_stock_status THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches THEN
      v_computed_price := CASE v_price_list.pricing_strategy
        WHEN 'margin_from_mrp' THEN COALESCE(v_mrp, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'flat_off_base'   THEN COALESCE(v_base_price, 0) - COALESCE(v_price_list.strategy_value, 0)
        WHEN 'percentage'      THEN COALESCE(v_base_price, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'per_item'        THEN COALESCE(v_price_list.strategy_value, 0)
        ELSE                        COALESCE(v_base_price, 0)
      END;
      v_computed_price := GREATEST(v_computed_price, 0);

      INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, valid_from)
      VALUES (v_price_list.id, p_tenant_product_id, v_computed_price, 1, v_now)
      ON CONFLICT (price_list_id, tenant_product_id, min_qty)
      DO UPDATE SET
        price      = EXCLUDED.price,
        valid_from = CASE WHEN app.price_list_items.deleted_at IS NOT NULL THEN v_now ELSE app.price_list_items.valid_from END,
        deleted_at = NULL;
    ELSE
      UPDATE app.price_list_items
      SET deleted_at = v_now
      WHERE price_list_id     = v_price_list.id
        AND tenant_product_id = p_tenant_product_id
        AND min_qty           = 1
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."evaluate_product_for_price_lists_v2"("uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."evaluate_product_for_campaigns_v2"("p_tenant_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id         uuid;
  v_brand_name        text;
  v_category_name     text;
  v_qty_available     numeric;
  v_reorder_point     numeric;
  v_is_new_in_stock   boolean;
  v_stock_status      text;
  v_campaign          record;
  v_rules             jsonb;
  v_brand_names       text[];
  v_category_names    text[];
  v_stock_filter      text;
  v_matches           boolean;
  v_now               timestamptz := now();
BEGIN
  SELECT
    tp.tenant_id,
    COALESCE(tb.display_name_override, b.name),
    tc.name
  INTO v_tenant_id, v_brand_name, v_category_name
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
  LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
  WHERE tp.id = p_tenant_product_id AND tp.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT ti.qty_available, ti.reorder_point
  INTO v_qty_available, v_reorder_point
  FROM app.tenant_inventory ti
  WHERE ti.tenant_product_id = p_tenant_product_id
    AND ti.deleted_at IS NULL
  ORDER BY ti.updated_at DESC
  LIMIT 1;

  v_is_new_in_stock := app.product_is_new_stock_today(p_tenant_product_id);
  v_stock_status    := app.derive_stock_status_bucket(v_qty_available, v_reorder_point, v_is_new_in_stock);

  FOR v_campaign IN
    SELECT c.id, c.dynamic_rules
    FROM app.campaigns c
    WHERE c.tenant_id              = v_tenant_id
      AND c.product_membership_mode = 'automatic'
      AND c.deleted_at IS NULL
  LOOP
    v_rules   := COALESCE(v_campaign.dynamic_rules, '{}'::jsonb);
    v_matches := true;

    SELECT array_agg(x) INTO v_brand_names
    FROM jsonb_array_elements_text(COALESCE(v_rules -> 'brand_names', '[]'::jsonb)) x;

    IF v_brand_names IS NOT NULL AND array_length(v_brand_names, 1) > 0 THEN
      IF NOT (lower(COALESCE(v_brand_name, '')) = ANY (SELECT lower(unnest(v_brand_names)))) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches THEN
      SELECT array_agg(x) INTO v_category_names
      FROM jsonb_array_elements_text(COALESCE(v_rules -> 'category_names', '[]'::jsonb)) x;

      IF v_category_names IS NOT NULL AND array_length(v_category_names, 1) > 0 THEN
        IF NOT (lower(COALESCE(v_category_name, '')) = ANY (SELECT lower(unnest(v_category_names)))) THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    IF v_matches THEN
      v_stock_filter := v_rules ->> 'stock_status';
      IF v_stock_filter IS NOT NULL AND v_stock_filter != v_stock_status THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches THEN
      INSERT INTO app.campaign_items (campaign_id, tenant_product_id, valid_from)
      VALUES (v_campaign.id, p_tenant_product_id, v_now)
      ON CONFLICT (campaign_id, tenant_product_id)
      DO UPDATE SET
        valid_from = CASE WHEN app.campaign_items.deleted_at IS NOT NULL THEN v_now ELSE app.campaign_items.valid_from END,
        deleted_at = NULL;
    ELSE
      UPDATE app.campaign_items
      SET deleted_at = v_now
      WHERE campaign_id       = v_campaign.id
        AND tenant_product_id = p_tenant_product_id
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."evaluate_product_for_campaigns_v2"("uuid") OWNER TO "postgres";

-- Batched variant for bulk sync paths (M11) -- avoids a per-row PERFORM loop over
-- potentially thousands of products in one Zoho/CSV sync.
CREATE OR REPLACE FUNCTION "app"."evaluate_products_for_price_lists_and_campaigns_batch"("p_tenant_product_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOREACH v_product_id IN ARRAY p_tenant_product_ids
  LOOP
    PERFORM app.evaluate_product_for_price_lists_v2(v_product_id);
    PERFORM app.evaluate_product_for_campaigns_v2(v_product_id);
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."evaluate_products_for_price_lists_and_campaigns_batch"("uuid"[]) OWNER TO "postgres";

GRANT ALL ON FUNCTION "app"."evaluate_buyer_for_cohorts_v2"("uuid") TO "service_role";
GRANT ALL ON FUNCTION "app"."evaluate_buyer_for_campaign_buyers"("uuid") TO "service_role";
GRANT ALL ON FUNCTION "app"."evaluate_product_for_price_lists_v2"("uuid") TO "service_role";
GRANT ALL ON FUNCTION "app"."evaluate_product_for_campaigns_v2"("uuid") TO "service_role";
GRANT ALL ON FUNCTION "app"."evaluate_products_for_price_lists_and_campaigns_batch"("uuid"[]) TO "service_role";
