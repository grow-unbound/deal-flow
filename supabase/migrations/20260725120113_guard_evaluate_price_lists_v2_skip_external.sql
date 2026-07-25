-- Bug: evaluate_product_for_price_lists_v2() computed prices for ALL
-- membership_mode='automatic' price lists, including externally-sourced ones
-- (Zoho-imported, external_ref IS NOT NULL). Zoho's 'per_item' pricing_strategy
-- (meaning: look up each item's own rate) collides with the local rule engine's
-- 'per_item' strategy (meaning: apply one flat strategy_value to every matching
-- product). Since Zoho imports never set strategy_value, the CASE branch
-- COALESCE(strategy_value, 0) zeroed out every item's price on the next dirty-mark
-- re-evaluation. A prior migration also mis-backfilled membership_mode='automatic'
-- onto Zoho price lists (now corrected via a one-off data fix + persist-time fix in
-- integrations-persist.ts). This adds a defense-in-depth guard so externally-sourced
-- price lists are never touched by this function regardless of membership_mode.

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
      AND pl.external_ref IS NULL
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
