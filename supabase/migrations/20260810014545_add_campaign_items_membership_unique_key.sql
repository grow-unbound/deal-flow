-- Campaign product membership is time-bound: an active row represents the current
-- membership window, and deleted_at closes it. Unlike price_list_items, campaign_items
-- intentionally has no unique key on (campaign_id, tenant_product_id), so automatic
-- refresh must not rely on ON CONFLICT for opens/reopens.

CREATE OR REPLACE FUNCTION app.evaluate_product_for_campaigns_v2(p_tenant_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_product record;
  v_inventory record;
  v_rules jsonb;
  v_matches boolean;
  v_stock_status text;
  v_sold boolean := false;
  v_campaign record;
  v_now timestamptz := now();
BEGIN
  SELECT tp.id, tp.tenant_id, tp.tenant_brand_id, tp.tenant_category_id,
         COALESCE(tb.display_name_override, b.name) AS brand_name,
         tc.name AS category_name,
         tp.deleted_at
  INTO v_product
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
  LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
  WHERE tp.id = p_tenant_product_id;

  IF NOT FOUND THEN
    UPDATE app.campaign_items
    SET deleted_at = v_now
    WHERE tenant_product_id = p_tenant_product_id
      AND deleted_at IS NULL;
    RETURN;
  END IF;

  IF v_product.deleted_at IS NOT NULL THEN
    UPDATE app.campaign_items ci
    SET deleted_at = v_now
    FROM app.campaigns c
    WHERE c.id = ci.campaign_id
      AND c.tenant_id = v_product.tenant_id
      AND c.product_membership_mode = 'automatic'
      AND ci.tenant_product_id = p_tenant_product_id
      AND ci.deleted_at IS NULL;
    RETURN;
  END IF;

  SELECT ti.qty_available, ti.reorder_point
  INTO v_inventory
  FROM app.tenant_inventory ti
  WHERE ti.tenant_product_id = p_tenant_product_id
    AND ti.deleted_at IS NULL
  ORDER BY ti.updated_at DESC
  LIMIT 1;

  v_stock_status := app.derive_stock_status_bucket(v_inventory.qty_available, v_inventory.reorder_point, app.product_is_new_stock_today(p_tenant_product_id));
  v_sold := app.membership_product_sold_this_quarter(v_product.tenant_id, p_tenant_product_id, v_now);

  FOR v_campaign IN
    SELECT id, dynamic_rules
    FROM app.campaigns
    WHERE tenant_id = v_product.tenant_id
      AND product_membership_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules := app.membership_normalize_product_rules(v_campaign.dynamic_rules);
    v_matches := app.membership_text_filter_matches(v_rules -> 'brand_names', v_product.tenant_brand_id::text, v_product.brand_name)
      AND app.membership_text_filter_matches(v_rules -> 'category_names', v_product.tenant_category_id::text, v_product.category_name);

    IF v_matches AND v_rules ? 'stock_status' AND v_rules ->> 'stock_status' <> v_stock_status THEN
      v_matches := false;
    END IF;

    IF v_matches AND v_rules ? 'sales_status_this_quarter' THEN
      IF (v_rules ->> 'sales_status_this_quarter' = 'sold' AND NOT v_sold)
        OR (v_rules ->> 'sales_status_this_quarter' = 'not_sold' AND v_sold) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches THEN
      UPDATE app.campaign_items
      SET updated_at = v_now,
          deleted_at = NULL
      WHERE campaign_id = v_campaign.id
        AND tenant_product_id = p_tenant_product_id
        AND deleted_at IS NULL;

      IF NOT FOUND THEN
        INSERT INTO app.campaign_items (campaign_id, tenant_product_id, valid_from)
        VALUES (v_campaign.id, p_tenant_product_id, v_now);
      END IF;
    ELSE
      UPDATE app.campaign_items
      SET deleted_at = v_now
      WHERE campaign_id = v_campaign.id
        AND tenant_product_id = p_tenant_product_id
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION app.evaluate_product_for_campaigns_v2(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION app.evaluate_product_for_campaigns_v2(uuid) TO service_role;
