CREATE OR REPLACE FUNCTION app.refresh_campaign_products_by_id(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_rules jsonb;
  v_product_membership_mode text;
  v_pricing_source text;
  v_price_list_id uuid;
  v_now timestamptz := now();
  v_want_inactive boolean;
  v_want_top20 boolean;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
BEGIN
  SELECT
    tenant_id,
    app.membership_normalize_product_rules(dynamic_rules),
    product_membership_mode,
    pricing_source,
    price_list_id
  INTO v_tenant_id, v_rules, v_product_membership_mode, v_pricing_source, v_price_list_id
  FROM app.campaigns
  WHERE id = p_campaign_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_product_membership_mode = 'automatic' THEN
    v_want_inactive := COALESCE(v_rules ->> 'status' = 'inactive', false);
    v_want_top20 := COALESCE(v_rules -> 'quick_filters' ? 'top20', false);

    WITH latest_inventory AS (
      SELECT DISTINCT ON (ti.tenant_product_id)
        ti.tenant_product_id, ti.qty_available, ti.reorder_point
      FROM app.tenant_inventory ti
      WHERE ti.deleted_at IS NULL
      ORDER BY ti.tenant_product_id, ti.updated_at DESC
    ),
    inventory_sum AS (
      SELECT tenant_product_id,
        SUM(COALESCE(qty_available, 0))::numeric AS qty_available_total,
        SUM(COALESCE(reorder_point, 0))::numeric AS reorder_point_total
      FROM app.tenant_inventory
      WHERE deleted_at IS NULL
      GROUP BY tenant_product_id
    ),
    scoped AS (
      SELECT
        tp.id AS tenant_product_id,
        tp.tenant_brand_id,
        tp.tenant_category_id,
        tp.is_active,
        COALESCE(tb.display_name_override, b.name) AS brand_name,
        tc.name AS category_name,
        app.derive_stock_status_bucket(li.qty_available, li.reorder_point, app.product_is_new_stock_today(tp.id)) AS stock_status,
        app.membership_product_sold_this_quarter(v_tenant_id, tp.id, v_now) AS sold_this_quarter,
        COALESCE(isum.qty_available_total, 0) AS qty_available_total,
        COALESCE(NULLIF(isum.reorder_point_total, 0), 10) AS effective_threshold,
        COALESCE(mps.invoice_value, 0) AS invoice_value,
        COALESCE(mps_prev.invoice_value, 0) AS prev_invoice_value,
        COALESCE(mps.estimate_value, 0) AS estimate_value,
        COALESCE(mps.order_value, 0) AS order_value
      FROM app.tenant_products tp
      LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
      LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
      LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
      LEFT JOIN latest_inventory li ON li.tenant_product_id = tp.id
      LEFT JOIN inventory_sum isum ON isum.tenant_product_id = tp.id
      LEFT JOIN app.metrics_product_period_summary mps
        ON mps.tenant_id = v_tenant_id AND mps.tenant_product_id = tp.id
       AND mps.grain = 'quarter' AND mps.period_start = v_quarter_start AND mps.deleted_at IS NULL
      LEFT JOIN app.metrics_product_period_summary mps_prev
        ON mps_prev.tenant_id = v_tenant_id AND mps_prev.tenant_product_id = tp.id
       AND mps_prev.grain = 'quarter' AND mps_prev.period_start = v_prev_quarter_start AND mps_prev.deleted_at IS NULL
      WHERE tp.tenant_id = v_tenant_id
        AND tp.deleted_at IS NULL
        AND ((NOT v_want_inactive AND COALESCE(tp.is_active, true)) OR (v_want_inactive AND tp.is_active = false))
    ),
    matched_pre AS (
      SELECT *
      FROM scoped s
      WHERE app.membership_text_filter_matches(v_rules -> 'brand_names', s.tenant_brand_id::text, s.brand_name)
        AND app.membership_text_filter_matches(v_rules -> 'category_names', s.tenant_category_id::text, s.category_name)
        AND (NOT (v_rules ? 'stock_status')
             OR v_rules ->> 'stock_status' = s.stock_status)
        AND (NOT (v_rules ? 'sales_status_this_quarter')
             OR (v_rules ->> 'sales_status_this_quarter' = 'sold') = s.sold_this_quarter)
        AND (
          NOT (v_rules ? 'quick_filters') OR jsonb_array_length(v_rules -> 'quick_filters') = 0
          OR (
            (v_rules -> 'quick_filters' ? 'selling_oos' AND s.invoice_value > 0 AND s.qty_available_total = 0)
            OR (v_rules -> 'quick_filters' ? 'selling_low_stock' AND s.invoice_value > 0 AND s.qty_available_total < s.effective_threshold)
            OR (v_rules -> 'quick_filters' ? 'selling_qtr' AND s.invoice_value > 0)
            OR (v_rules -> 'quick_filters' ? 'not_selling_qtr' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
            OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (s.estimate_value > 0 OR s.order_value > 0) AND s.invoice_value = 0)
            OR (v_rules -> 'quick_filters' ? 'top20' AND s.invoice_value > 0)
          )
        )
        AND (NOT (v_rules ? 'stock')
          OR (v_rules ->> 'stock' = 'in_stock' AND s.qty_available_total >= s.effective_threshold)
          OR (v_rules ->> 'stock' = 'low_stock' AND s.qty_available_total > 0 AND s.qty_available_total < s.effective_threshold)
          OR (v_rules ->> 'stock' = 'out_of_stock' AND s.qty_available_total = 0))
        AND (NOT (v_rules ? 'status')
          OR (v_rules ->> 'status' = 'active' AND s.invoice_value > 0)
          OR (v_rules ->> 'status' = 'dormant' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
          OR (v_rules ->> 'status' = 'inactive'))
        AND (NOT (v_rules ? 'brand_ids') OR jsonb_array_length(v_rules -> 'brand_ids') = 0 OR v_rules -> 'brand_ids' ? s.tenant_brand_id::text)
        AND (NOT (v_rules ? 'category_ids') OR jsonb_array_length(v_rules -> 'category_ids') = 0 OR v_rules -> 'category_ids' ? s.tenant_category_id::text)
    ),
    gmv_rank AS (
      SELECT tenant_product_id, percent_rank() OVER (ORDER BY invoice_value DESC) AS pct_rank
      FROM matched_pre WHERE invoice_value > 0
    ),
    matched AS (
      SELECT mp.tenant_product_id
      FROM matched_pre mp
      LEFT JOIN gmv_rank gr ON gr.tenant_product_id = mp.tenant_product_id
      WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
    ),
    closed AS (
      UPDATE app.campaign_items ci
      SET deleted_at = v_now
      WHERE ci.campaign_id = p_campaign_id
        AND ci.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM matched m WHERE m.tenant_product_id = ci.tenant_product_id)
      RETURNING ci.tenant_product_id
    )
    INSERT INTO app.campaign_items (campaign_id, tenant_product_id, valid_from)
    SELECT p_campaign_id, m.tenant_product_id, v_now
    FROM matched m
    ON CONFLICT (campaign_id, tenant_product_id)
    DO UPDATE SET updated_at = v_now, deleted_at = NULL;
  END IF;

  IF v_pricing_source = 'pricelist' THEN
    UPDATE app.campaign_items ci
    SET
      price_override = priced.price_override,
      updated_at = CASE
        WHEN ci.price_override IS DISTINCT FROM priced.price_override THEN v_now
        ELSE ci.updated_at
      END
    FROM (
      SELECT
        ci_inner.id AS campaign_item_id,
        COALESCE(pli.price, tp.base_selling_price) AS price_override
      FROM app.campaign_items ci_inner
      JOIN app.tenant_products tp
        ON tp.id = ci_inner.tenant_product_id
       AND tp.tenant_id = v_tenant_id
       AND tp.deleted_at IS NULL
      LEFT JOIN app.price_list_items pli
        ON pli.price_list_id = v_price_list_id
       AND pli.tenant_product_id = ci_inner.tenant_product_id
       AND COALESCE(pli.min_qty, 1) = 1
       AND pli.deleted_at IS NULL
      WHERE ci_inner.campaign_id = p_campaign_id
        AND ci_inner.deleted_at IS NULL
    ) priced
    WHERE ci.id = priced.campaign_item_id
      AND ci.price_override IS DISTINCT FROM priced.price_override;
  END IF;
END;
$function$;
