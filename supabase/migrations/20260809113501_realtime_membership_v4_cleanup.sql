-- Realtime automatic membership cleanup:
-- - canonical current-quarter rule schema (no 90d buckets)
-- - candidate dirty queue entries for buyer/product changes
-- - raw-table evaluators for realtime qualification
-- - v4 period-summary detail search

ALTER TABLE app.membership_dirty_work
  DROP CONSTRAINT IF EXISTS membership_dirty_work_entity_type_check;

ALTER TABLE app.membership_dirty_work
  ADD CONSTRAINT membership_dirty_work_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'cohort',
    'price_list',
    'campaign_buyers',
    'campaign_products',
    'buyer_candidate',
    'product_candidate'
  ]::text[]));

CREATE OR REPLACE FUNCTION app.membership_normalize_buyer_rules(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_rules jsonb := COALESCE(p_rules, '{}'::jsonb);
  v_next jsonb := '{}'::jsonb;
  v_last_sale text := v_rules ->> 'last_sale_bucket';
  v_sales text := v_rules ->> 'sales_90d_level';
BEGIN
  IF v_rules ? 'buyer_app_status' THEN
    v_next := jsonb_set(v_next, '{buyer_app_status}', to_jsonb(v_rules ->> 'buyer_app_status'), true);
  END IF;

  IF v_rules ? 'demand_status_this_quarter' THEN
    v_next := jsonb_set(v_next, '{demand_status_this_quarter}', to_jsonb(v_rules ->> 'demand_status_this_quarter'), true);
  ELSIF v_last_sale IN ('within_30_days', 'within_90_days') THEN
    v_next := jsonb_set(v_next, '{demand_status_this_quarter}', '"has_demand"'::jsonb, true);
  ELSIF v_last_sale IN ('dormant_90_plus_days', 'never_ordered') THEN
    v_next := jsonb_set(v_next, '{demand_status_this_quarter}', '"no_demand"'::jsonb, true);
  END IF;

  IF v_rules ? 'invoice_status_this_quarter' THEN
    v_next := jsonb_set(v_next, '{invoice_status_this_quarter}', to_jsonb(v_rules ->> 'invoice_status_this_quarter'), true);
  ELSIF v_sales IN ('low', 'medium', 'high') THEN
    v_next := jsonb_set(v_next, '{invoice_status_this_quarter}', '"purchased"'::jsonb, true);
  ELSIF v_sales = 'none' THEN
    v_next := jsonb_set(v_next, '{invoice_status_this_quarter}', '"not_purchased"'::jsonb, true);
  END IF;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION app.membership_normalize_product_rules(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_rules jsonb := COALESCE(p_rules, '{}'::jsonb);
  v_next jsonb := '{}'::jsonb;
  v_availability text := v_rules ->> 'availability';
  v_gmv text := v_rules ->> 'gmv_90d_bucket';
BEGIN
  IF v_rules ? 'brand_names' THEN
    v_next := jsonb_set(v_next, '{brand_names}', COALESCE(v_rules -> 'brand_names', '[]'::jsonb), true);
  ELSE
    v_next := jsonb_set(v_next, '{brand_names}', '[]'::jsonb, true);
  END IF;

  IF v_rules ? 'category_names' THEN
    v_next := jsonb_set(v_next, '{category_names}', COALESCE(v_rules -> 'category_names', '[]'::jsonb), true);
  ELSE
    v_next := jsonb_set(v_next, '{category_names}', '[]'::jsonb, true);
  END IF;

  IF v_rules ? 'stock_status' THEN
    v_next := jsonb_set(v_next, '{stock_status}', to_jsonb(v_rules ->> 'stock_status'), true);
  ELSIF v_availability IN ('in_stock', 'low_stock', 'out_of_stock') THEN
    v_next := jsonb_set(v_next, '{stock_status}', to_jsonb(v_availability), true);
  ELSIF v_availability = 'new_in_stock_today' THEN
    v_next := jsonb_set(v_next, '{stock_status}', '"new_stock"'::jsonb, true);
  ELSIF v_availability = 'in_stock_only' THEN
    v_next := jsonb_set(v_next, '{stock_status}', '"in_stock"'::jsonb, true);
  ELSIF v_availability = 'low_stock_only' THEN
    v_next := jsonb_set(v_next, '{stock_status}', '"low_stock"'::jsonb, true);
  END IF;

  IF v_rules ? 'sales_status_this_quarter' THEN
    v_next := jsonb_set(v_next, '{sales_status_this_quarter}', to_jsonb(v_rules ->> 'sales_status_this_quarter'), true);
  ELSIF v_gmv = 'gmv_0' THEN
    v_next := jsonb_set(v_next, '{sales_status_this_quarter}', '"not_sold"'::jsonb, true);
  ELSIF v_gmv IS NOT NULL THEN
    v_next := jsonb_set(v_next, '{sales_status_this_quarter}', '"sold"'::jsonb, true);
  END IF;

  RETURN v_next;
END;
$$;

UPDATE app.cohorts
SET rules = app.membership_normalize_buyer_rules(rules),
    updated_at = now()
WHERE membership_mode = 'automatic'
  AND deleted_at IS NULL
  AND (
    rules ? 'last_sale_bucket'
    OR rules ? 'sales_90d_level'
    OR rules ? 'demand_status_this_quarter'
    OR rules ? 'invoice_status_this_quarter'
  );

UPDATE app.campaigns
SET buyer_filter_rules = app.membership_normalize_buyer_rules(buyer_filter_rules),
    updated_at = now()
WHERE buyer_target_mode = 'automatic'
  AND deleted_at IS NULL
  AND (
    buyer_filter_rules ? 'last_sale_bucket'
    OR buyer_filter_rules ? 'sales_90d_level'
    OR buyer_filter_rules ? 'demand_status_this_quarter'
    OR buyer_filter_rules ? 'invoice_status_this_quarter'
  );

UPDATE app.price_lists
SET filters = app.membership_normalize_product_rules(filters),
    updated_at = now()
WHERE membership_mode = 'automatic'
  AND deleted_at IS NULL;

UPDATE app.campaigns
SET dynamic_rules = app.membership_normalize_product_rules(dynamic_rules),
    updated_at = now()
WHERE product_membership_mode = 'automatic'
  AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.membership_buyer_has_invoice_this_quarter(p_tenant_id uuid, p_buyer_id uuid, p_as_of timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.metrics_v4_period_bounds('this_quarter', p_as_of) b
    JOIN app.invoices i
      ON i.tenant_id = p_tenant_id
     AND i.buyer_id = p_buyer_id
     AND i.deleted_at IS NULL
     AND app.invoice_status_gmv_included(i.status)
     AND app.metric_day_ist(i.invoice_date, i.created_at) >= b.period_start
     AND app.metric_day_ist(i.invoice_date, i.created_at) < b.period_end_exclusive
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION app.membership_buyer_has_demand_this_quarter(p_tenant_id uuid, p_buyer_id uuid, p_as_of timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_kind text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_bounds record;
BEGIN
  SELECT * INTO v_bounds FROM app.metrics_v4_period_bounds('this_quarter', p_as_of);

  IF v_kind = 'orders' THEN
    RETURN EXISTS (
      SELECT 1
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.buyer_id = p_buyer_id
        AND o.deleted_at IS NULL
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_bounds.period_start
        AND app.metric_day_ist(o.order_date, o.created_at) < v_bounds.period_end_exclusive
      LIMIT 1
    );
  ELSIF v_kind = 'estimates' THEN
    RETURN EXISTS (
      SELECT 1
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id
        AND e.buyer_id = p_buyer_id
        AND e.deleted_at IS NULL
        AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_bounds.period_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < v_bounds.period_end_exclusive
      LIMIT 1
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION app.membership_product_sold_this_quarter(p_tenant_id uuid, p_tenant_product_id uuid, p_as_of timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.metrics_v4_period_bounds('this_quarter', p_as_of) b
    JOIN app.invoice_items ii
      ON ii.tenant_product_id = p_tenant_product_id
     AND ii.deleted_at IS NULL
    JOIN app.invoices i
      ON i.id = ii.invoice_id
     AND i.tenant_id = p_tenant_id
     AND i.deleted_at IS NULL
     AND app.invoice_status_gmv_included(i.status)
     AND app.metric_day_ist(i.invoice_date, i.created_at) >= b.period_start
     AND app.metric_day_ist(i.invoice_date, i.created_at) < b.period_end_exclusive
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION app.membership_text_filter_matches(p_values jsonb, VARIADIC p_candidates text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  WITH vals AS (
    SELECT lower(value) AS value
    FROM jsonb_array_elements_text(COALESCE(p_values, '[]'::jsonb))
  ), candidates AS (
    SELECT lower(candidate) AS candidate
    FROM unnest(p_candidates) AS candidate
    WHERE candidate IS NOT NULL AND candidate <> ''
  )
  SELECT NOT EXISTS (SELECT 1 FROM vals)
      OR EXISTS (
        SELECT 1
        FROM vals v
        JOIN candidates c ON c.candidate = v.value
      );
$$;

CREATE OR REPLACE FUNCTION app.evaluate_buyer_for_cohorts_v2(p_buyer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_buyer record;
  v_rules jsonb;
  v_matches boolean;
  v_has_invoice boolean := false;
  v_has_demand boolean := false;
  v_buyer_app_status text;
  v_cohort record;
  v_now timestamptz := now();
BEGIN
  SELECT id, tenant_id, is_active, buyer_app_enabled, deleted_at
  INTO v_buyer
  FROM app.buyers
  WHERE id = p_buyer_id;

  IF NOT FOUND THEN
    UPDATE app.cohort_members SET valid_until = v_now WHERE buyer_id = p_buyer_id AND valid_until IS NULL;
    UPDATE app.campaign_buyer_members SET valid_until = v_now WHERE buyer_id = p_buyer_id AND valid_until IS NULL;
    RETURN;
  END IF;

  IF v_buyer.deleted_at IS NOT NULL OR COALESCE(v_buyer.is_active, true) = false THEN
    UPDATE app.cohort_members cm
    SET valid_until = v_now
    FROM app.cohorts c
    WHERE c.id = cm.cohort_id
      AND c.tenant_id = v_buyer.tenant_id
      AND c.membership_mode = 'automatic'
      AND cm.buyer_id = p_buyer_id
      AND cm.valid_until IS NULL;

    UPDATE app.campaign_buyer_members cbm
    SET valid_until = v_now
    FROM app.campaigns c
    WHERE c.id = cbm.campaign_id
      AND c.tenant_id = v_buyer.tenant_id
      AND c.buyer_target_mode = 'automatic'
      AND cbm.buyer_id = p_buyer_id
      AND cbm.valid_until IS NULL;

    UPDATE app.cohorts c
    SET cached_member_count = (SELECT COUNT(*) FROM app.cohort_members_active WHERE cohort_id = c.id),
        last_refreshed_at = v_now
    WHERE c.tenant_id = v_buyer.tenant_id
      AND c.membership_mode = 'automatic'
      AND c.deleted_at IS NULL;
    RETURN;
  END IF;

  v_has_invoice := app.membership_buyer_has_invoice_this_quarter(v_buyer.tenant_id, p_buyer_id, v_now);
  v_has_demand := app.membership_buyer_has_demand_this_quarter(v_buyer.tenant_id, p_buyer_id, v_now);
  v_buyer_app_status := app.derive_buyer_app_status(v_buyer.is_active, v_buyer.buyer_app_enabled);

  FOR v_cohort IN
    SELECT id, rules
    FROM app.cohorts
    WHERE tenant_id = v_buyer.tenant_id
      AND membership_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules := app.membership_normalize_buyer_rules(v_cohort.rules);
    v_matches := true;

    IF v_rules ? 'buyer_app_status' AND v_rules ->> 'buyer_app_status' <> v_buyer_app_status THEN
      v_matches := false;
    END IF;

    IF v_matches AND v_rules ? 'invoice_status_this_quarter' THEN
      IF (v_rules ->> 'invoice_status_this_quarter' = 'purchased' AND NOT v_has_invoice)
        OR (v_rules ->> 'invoice_status_this_quarter' = 'not_purchased' AND v_has_invoice) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'demand_status_this_quarter' THEN
      IF (v_rules ->> 'demand_status_this_quarter' = 'has_demand' AND NOT v_has_demand)
        OR (v_rules ->> 'demand_status_this_quarter' = 'no_demand' AND v_has_demand) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches THEN
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
  SET cached_member_count = (SELECT COUNT(*) FROM app.cohort_members_active WHERE cohort_id = c.id),
      last_refreshed_at = v_now
  WHERE c.tenant_id = v_buyer.tenant_id
    AND c.membership_mode = 'automatic'
    AND c.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.evaluate_buyer_for_campaign_buyers(p_buyer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_buyer record;
  v_rules jsonb;
  v_matches boolean;
  v_has_invoice boolean := false;
  v_has_demand boolean := false;
  v_buyer_app_status text;
  v_campaign record;
  v_now timestamptz := now();
BEGIN
  SELECT id, tenant_id, is_active, buyer_app_enabled, deleted_at
  INTO v_buyer
  FROM app.buyers
  WHERE id = p_buyer_id;

  IF NOT FOUND THEN
    UPDATE app.campaign_buyer_members SET valid_until = v_now WHERE buyer_id = p_buyer_id AND valid_until IS NULL;
    RETURN;
  END IF;

  IF v_buyer.deleted_at IS NOT NULL OR COALESCE(v_buyer.is_active, true) = false THEN
    UPDATE app.campaign_buyer_members cbm
    SET valid_until = v_now
    FROM app.campaigns c
    WHERE c.id = cbm.campaign_id
      AND c.tenant_id = v_buyer.tenant_id
      AND c.buyer_target_mode = 'automatic'
      AND cbm.buyer_id = p_buyer_id
      AND cbm.valid_until IS NULL;
    RETURN;
  END IF;

  v_has_invoice := app.membership_buyer_has_invoice_this_quarter(v_buyer.tenant_id, p_buyer_id, v_now);
  v_has_demand := app.membership_buyer_has_demand_this_quarter(v_buyer.tenant_id, p_buyer_id, v_now);
  v_buyer_app_status := app.derive_buyer_app_status(v_buyer.is_active, v_buyer.buyer_app_enabled);

  FOR v_campaign IN
    SELECT id, buyer_filter_rules
    FROM app.campaigns
    WHERE tenant_id = v_buyer.tenant_id
      AND buyer_target_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules := app.membership_normalize_buyer_rules(v_campaign.buyer_filter_rules);
    v_matches := true;

    IF v_rules ? 'buyer_app_status' AND v_rules ->> 'buyer_app_status' <> v_buyer_app_status THEN
      v_matches := false;
    END IF;

    IF v_matches AND v_rules ? 'invoice_status_this_quarter' THEN
      IF (v_rules ->> 'invoice_status_this_quarter' = 'purchased' AND NOT v_has_invoice)
        OR (v_rules ->> 'invoice_status_this_quarter' = 'not_purchased' AND v_has_invoice) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'demand_status_this_quarter' THEN
      IF (v_rules ->> 'demand_status_this_quarter' = 'has_demand' AND NOT v_has_demand)
        OR (v_rules ->> 'demand_status_this_quarter' = 'no_demand' AND v_has_demand) THEN
        v_matches := false;
      END IF;
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

CREATE OR REPLACE FUNCTION app.evaluate_product_for_price_lists_v2(p_tenant_product_id uuid)
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
  v_price_list record;
  v_computed_price numeric;
  v_now timestamptz := now();
BEGIN
  SELECT tp.id, tp.tenant_id, tp.tenant_brand_id, tp.tenant_category_id,
         COALESCE(tb.display_name_override, b.name) AS brand_name,
         tc.name AS category_name,
         tp.base_selling_price, tp.mrp, tp.deleted_at
  INTO v_product
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
  LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
  WHERE tp.id = p_tenant_product_id;

  IF NOT FOUND THEN
    UPDATE app.price_list_items SET deleted_at = v_now WHERE tenant_product_id = p_tenant_product_id AND deleted_at IS NULL;
    UPDATE app.campaign_items SET deleted_at = v_now WHERE tenant_product_id = p_tenant_product_id AND deleted_at IS NULL;
    RETURN;
  END IF;

  IF v_product.deleted_at IS NOT NULL THEN
    UPDATE app.price_list_items pli
    SET deleted_at = v_now
    FROM app.price_lists pl
    WHERE pl.id = pli.price_list_id
      AND pl.tenant_id = v_product.tenant_id
      AND pl.membership_mode = 'automatic'
      AND pli.tenant_product_id = p_tenant_product_id
      AND pli.deleted_at IS NULL;
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

  FOR v_price_list IN
    SELECT id, filters, pricing_strategy, strategy_value
    FROM app.price_lists
    WHERE tenant_id = v_product.tenant_id
      AND membership_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    IF v_price_list.pricing_strategy = 'edit_each' THEN
      CONTINUE;
    END IF;

    v_rules := app.membership_normalize_product_rules(v_price_list.filters);
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
      v_computed_price := CASE v_price_list.pricing_strategy
        WHEN 'margin_from_mrp' THEN COALESCE(v_product.mrp, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'flat_off_base' THEN COALESCE(v_product.base_selling_price, 0) - COALESCE(v_price_list.strategy_value, 0)
        WHEN 'percentage' THEN COALESCE(v_product.base_selling_price, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'per_item' THEN COALESCE(v_price_list.strategy_value, 0)
        ELSE COALESCE(v_product.base_selling_price, 0)
      END;

      INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, valid_from)
      VALUES (v_price_list.id, p_tenant_product_id, GREATEST(v_computed_price, 0), 1, v_now)
      ON CONFLICT (price_list_id, tenant_product_id, min_qty)
      DO UPDATE SET
        price = EXCLUDED.price,
        valid_from = CASE WHEN app.price_list_items.deleted_at IS NOT NULL THEN v_now ELSE app.price_list_items.valid_from END,
        deleted_at = NULL;
    ELSE
      UPDATE app.price_list_items
      SET deleted_at = v_now
      WHERE price_list_id = v_price_list.id
        AND tenant_product_id = p_tenant_product_id
        AND min_qty = 1
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

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
    UPDATE app.campaign_items SET deleted_at = v_now WHERE tenant_product_id = p_tenant_product_id AND deleted_at IS NULL;
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
      INSERT INTO app.campaign_items (campaign_id, tenant_product_id, valid_from)
      VALUES (v_campaign.id, p_tenant_product_id, v_now)
      ON CONFLICT (campaign_id, tenant_product_id)
      DO UPDATE SET
        valid_from = CASE WHEN app.campaign_items.deleted_at IS NOT NULL THEN v_now ELSE app.campaign_items.valid_from END,
        deleted_at = NULL;
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

CREATE OR REPLACE FUNCTION app.refresh_cohort_by_id(p_cohort_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_buyer record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.cohorts
  WHERE id = p_cohort_id AND membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_buyer IN
    SELECT id FROM app.buyers WHERE tenant_id = v_tenant_id AND deleted_at IS NULL
  LOOP
    PERFORM app.evaluate_buyer_for_cohorts_v2(v_buyer.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_campaign_buyers_by_id(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_buyer record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.campaigns
  WHERE id = p_campaign_id AND buyer_target_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_buyer IN
    SELECT id FROM app.buyers WHERE tenant_id = v_tenant_id AND deleted_at IS NULL
  LOOP
    PERFORM app.evaluate_buyer_for_campaign_buyers(v_buyer.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.membership_mark_candidate_dirty(p_tenant_id uuid, p_candidate_type text, p_candidate_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL OR p_candidate_type NOT IN ('buyer_candidate', 'product_candidate') THEN
    RETURN;
  END IF;

  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  VALUES (p_tenant_id, p_candidate_type, p_candidate_id, p_reason)
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION app.membership_refresh_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row app.membership_dirty_work%ROWTYPE;
  v_owner uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_row
  FROM app.membership_dirty_work
  WHERE state = 'pending' AND next_attempt_at <= now()
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE app.membership_dirty_work
  SET state = 'claimed', lease_owner = v_owner, lease_until = now() + interval '2 minutes', updated_at = now()
  WHERE id = v_row.id;

  BEGIN
    IF v_row.entity_type = 'cohort' THEN
      PERFORM app.refresh_cohort_by_id(v_row.entity_id);
    ELSIF v_row.entity_type = 'price_list' THEN
      PERFORM app.refresh_price_list_by_id(v_row.entity_id);
    ELSIF v_row.entity_type = 'campaign_buyers' THEN
      PERFORM app.refresh_campaign_buyers_by_id(v_row.entity_id);
    ELSIF v_row.entity_type = 'campaign_products' THEN
      PERFORM app.refresh_campaign_products_by_id(v_row.entity_id);
    ELSIF v_row.entity_type = 'buyer_candidate' THEN
      PERFORM app.evaluate_buyer_for_cohorts_v2(v_row.entity_id);
      PERFORM app.evaluate_buyer_for_campaign_buyers(v_row.entity_id);
    ELSIF v_row.entity_type = 'product_candidate' THEN
      PERFORM app.evaluate_product_for_price_lists_v2(v_row.entity_id);
      PERFORM app.evaluate_product_for_campaigns_v2(v_row.entity_id);
    END IF;

    UPDATE app.membership_dirty_work
    SET state = 'done', updated_at = now()
    WHERE id = v_row.id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE app.membership_dirty_work
    SET state = CASE WHEN attempts >= 4 THEN 'failed' ELSE 'pending' END,
        attempts = attempts + 1,
        next_attempt_at = now() + (interval '30 seconds' * (attempts + 1)),
        last_error = SQLERRM,
        lease_owner = NULL,
        lease_until = NULL,
        updated_at = now()
    WHERE id = v_row.id;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_buyer_candidate_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM app.membership_mark_candidate_dirty(v_row.tenant_id, 'buyer_candidate', v_row.id, TG_TABLE_NAME || '_' || lower(TG_OP));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_order_buyer_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM app.membership_mark_candidate_dirty(v_row.tenant_id, 'buyer_candidate', v_row.buyer_id, TG_TABLE_NAME || '_' || lower(TG_OP));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_document_item_product_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
  v_tenant_id uuid;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF TG_TABLE_NAME = 'order_items' THEN
    SELECT tenant_id INTO v_tenant_id FROM app.orders WHERE id = v_row.order_id;
  ELSIF TG_TABLE_NAME = 'estimate_items' THEN
    SELECT tenant_id INTO v_tenant_id FROM app.estimates WHERE id = v_row.estimate_id;
  ELSIF TG_TABLE_NAME = 'invoice_items' THEN
    SELECT tenant_id INTO v_tenant_id FROM app.invoices WHERE id = v_row.invoice_id;
  END IF;

  PERFORM app.membership_mark_candidate_dirty(v_tenant_id, 'product_candidate', v_row.tenant_product_id, TG_TABLE_NAME || '_' || lower(TG_OP));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_product_candidate_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM app.membership_mark_candidate_dirty(v_row.tenant_id, 'product_candidate', v_row.id, TG_TABLE_NAME || '_' || lower(TG_OP));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_inventory_product_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
  v_tenant_id uuid;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT tenant_id INTO v_tenant_id FROM app.tenant_products WHERE id = v_row.tenant_product_id;
  PERFORM app.membership_mark_candidate_dirty(v_tenant_id, 'product_candidate', v_row.tenant_product_id, TG_TABLE_NAME || '_' || lower(TG_OP));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_brand_products_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
  v_product record;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  FOR v_product IN
    SELECT id FROM app.tenant_products WHERE tenant_brand_id = v_row.id AND deleted_at IS NULL
  LOOP
    PERFORM app.membership_mark_candidate_dirty(v_row.tenant_id, 'product_candidate', v_product.id, TG_TABLE_NAME || '_' || lower(TG_OP));
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_category_products_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
  v_product record;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  FOR v_product IN
    SELECT id FROM app.tenant_products WHERE tenant_category_id = v_row.id AND deleted_at IS NULL
  LOOP
    PERFORM app.membership_mark_candidate_dirty(v_row.tenant_id, 'product_candidate', v_product.id, TG_TABLE_NAME || '_' || lower(TG_OP));
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_membership_target_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row record;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF TG_TABLE_NAME = 'cohorts' AND v_row.membership_mode = 'automatic' THEN
    PERFORM app.membership_mark_dirty(v_row.tenant_id, 'cohort', v_row.id, TG_TABLE_NAME || '_' || lower(TG_OP));
  ELSIF TG_TABLE_NAME = 'price_lists' AND v_row.membership_mode = 'automatic' THEN
    PERFORM app.membership_mark_dirty(v_row.tenant_id, 'price_list', v_row.id, TG_TABLE_NAME || '_' || lower(TG_OP));
  ELSIF TG_TABLE_NAME = 'campaigns' THEN
    IF v_row.buyer_target_mode = 'automatic' THEN
      PERFORM app.membership_mark_dirty(v_row.tenant_id, 'campaign_buyers', v_row.id, TG_TABLE_NAME || '_buyer_' || lower(TG_OP));
    END IF;
    IF v_row.product_membership_mode = 'automatic' THEN
      PERFORM app.membership_mark_dirty(v_row.tenant_id, 'campaign_products', v_row.id, TG_TABLE_NAME || '_product_' || lower(TG_OP));
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_buyer_candidate_dirty ON app.buyers;
CREATE TRIGGER trg_membership_buyer_candidate_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.buyers
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_buyer_candidate_dirty();

DROP TRIGGER IF EXISTS trg_membership_order_buyer_dirty ON app.orders;
CREATE TRIGGER trg_membership_order_buyer_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.orders
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_order_buyer_dirty();

DROP TRIGGER IF EXISTS trg_membership_estimate_buyer_dirty ON app.estimates;
CREATE TRIGGER trg_membership_estimate_buyer_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.estimates
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_order_buyer_dirty();

DROP TRIGGER IF EXISTS trg_membership_invoice_buyer_dirty ON app.invoices;
CREATE TRIGGER trg_membership_invoice_buyer_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.invoices
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_order_buyer_dirty();

DROP TRIGGER IF EXISTS trg_membership_order_item_product_dirty ON app.order_items;
CREATE TRIGGER trg_membership_order_item_product_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.order_items
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_document_item_product_dirty();

DROP TRIGGER IF EXISTS trg_membership_estimate_item_product_dirty ON app.estimate_items;
CREATE TRIGGER trg_membership_estimate_item_product_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.estimate_items
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_document_item_product_dirty();

DROP TRIGGER IF EXISTS trg_membership_invoice_item_product_dirty ON app.invoice_items;
CREATE TRIGGER trg_membership_invoice_item_product_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.invoice_items
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_document_item_product_dirty();

DROP TRIGGER IF EXISTS trg_membership_product_candidate_dirty ON app.tenant_products;
CREATE TRIGGER trg_membership_product_candidate_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.tenant_products
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_product_candidate_dirty();

DROP TRIGGER IF EXISTS trg_membership_inventory_product_dirty ON app.tenant_inventory;
CREATE TRIGGER trg_membership_inventory_product_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.tenant_inventory
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_inventory_product_dirty();

DROP TRIGGER IF EXISTS trg_membership_stock_event_product_dirty ON app.stock_in_events;
CREATE TRIGGER trg_membership_stock_event_product_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.stock_in_events
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_inventory_product_dirty();

DROP TRIGGER IF EXISTS trg_membership_brand_products_dirty ON app.tenant_brands;
CREATE TRIGGER trg_membership_brand_products_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.tenant_brands
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_brand_products_dirty();

DROP TRIGGER IF EXISTS trg_membership_category_products_dirty ON app.tenant_categories;
CREATE TRIGGER trg_membership_category_products_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.tenant_categories
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_category_products_dirty();

DROP TRIGGER IF EXISTS trg_membership_cohort_target_dirty ON app.cohorts;
CREATE TRIGGER trg_membership_cohort_target_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.cohorts
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_target_dirty();

DROP TRIGGER IF EXISTS trg_membership_price_list_target_dirty ON app.price_lists;
CREATE TRIGGER trg_membership_price_list_target_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.price_lists
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_target_dirty();

DROP TRIGGER IF EXISTS trg_membership_campaign_target_dirty ON app.campaigns;
CREATE TRIGGER trg_membership_campaign_target_dirty
AFTER INSERT OR UPDATE OR DELETE ON app.campaigns
FOR EACH ROW EXECUTE FUNCTION app.trg_membership_target_dirty();

CREATE OR REPLACE FUNCTION app.membership_enqueue_time_boundary_refresh(p_reason text DEFAULT 'time_boundary')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'cohort', id, p_reason
  FROM app.cohorts
  WHERE membership_mode = 'automatic' AND deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'campaign_buyers', id, p_reason
  FROM app.campaigns
  WHERE buyer_target_mode = 'automatic' AND deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'price_list', id, p_reason
  FROM app.price_lists
  WHERE membership_mode = 'automatic' AND deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'campaign_products', id, p_reason
  FROM app.campaigns
  WHERE product_membership_mode = 'automatic' AND deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_membership_refresh_tick_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-automatic-refresh-tick') THEN
    PERFORM cron.schedule('membership-automatic-refresh-tick', '30 seconds', $cron$SELECT app.membership_refresh_tick();$cron$);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-time-boundary-refresh') THEN
    PERFORM cron.schedule('membership-time-boundary-refresh', '5 0 * * *', $cron$SELECT app.membership_enqueue_time_boundary_refresh('scheduled_time_boundary');$cron$);
  END IF;
END;
$$;

SELECT app.ensure_membership_refresh_tick_cron_scheduled();

CREATE OR REPLACE FUNCTION app.preview_buyer_membership_count(p_tenant_id uuid, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_rules jsonb := app.membership_normalize_buyer_rules(p_rules);
  v_count integer := 0;
  v_sample_names text[] := '{}';
BEGIN
  WITH scoped AS (
    SELECT
      b.id,
      b.business_name,
      app.derive_buyer_app_status(b.is_active, b.buyer_app_enabled) AS buyer_app_status,
      app.membership_buyer_has_invoice_this_quarter(p_tenant_id, b.id) AS has_invoice,
      app.membership_buyer_has_demand_this_quarter(p_tenant_id, b.id) AS has_demand
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND COALESCE(b.is_active, true)
  ), matched AS (
    SELECT *
    FROM scoped s
    WHERE (NOT (v_rules ? 'buyer_app_status') OR s.buyer_app_status = v_rules ->> 'buyer_app_status')
      AND (NOT (v_rules ? 'invoice_status_this_quarter')
        OR (v_rules ->> 'invoice_status_this_quarter' = 'purchased' AND s.has_invoice)
        OR (v_rules ->> 'invoice_status_this_quarter' = 'not_purchased' AND NOT s.has_invoice))
      AND (NOT (v_rules ? 'demand_status_this_quarter')
        OR (v_rules ->> 'demand_status_this_quarter' = 'has_demand' AND s.has_demand)
        OR (v_rules ->> 'demand_status_this_quarter' = 'no_demand' AND NOT s.has_demand))
  )
  SELECT COUNT(*), (SELECT array_agg(business_name ORDER BY business_name) FROM (SELECT business_name FROM matched ORDER BY business_name LIMIT 5) sample)
  INTO v_count, v_sample_names
  FROM matched;

  RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
END;
$$;

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

DROP FUNCTION IF EXISTS app.search_cohort_buyers_detail(uuid, uuid, text, text, text[], text[], text[], text, integer, integer);

CREATE OR REPLACE FUNCTION app.search_cohort_buyers_detail(
  p_tenant_id uuid,
  p_cohort_id uuid,
  p_query text DEFAULT NULL,
  p_member text DEFAULT 'yes',
  p_invoice_this_quarter text[] DEFAULT NULL,
  p_demand_this_quarter text[] DEFAULT NULL,
  p_buyer_app text[] DEFAULT NULL,
  p_sort text DEFAULT 'spend_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  buyer_id uuid,
  business_name text,
  contact_name text,
  external_ref text,
  geography_label text,
  tier text,
  spend_90d numeric,
  invoice_count_90d bigint,
  demand_value_90d numeric,
  demand_count_90d bigint,
  outstanding_due numeric,
  last_invoice_at timestamptz,
  last_primary_demand_at timestamptz,
  is_member boolean,
  buyer_app_status text,
  primary_demand_kind text,
  mtd_spend numeric,
  orders_mtd bigint,
  aov numeric,
  credit_used numeric,
  last_order_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '10s'
AS $$
  WITH bounds AS MATERIALIZED (
    SELECT * FROM app.metrics_v4_period_bounds('this_quarter', now())
  ), primary_kind AS MATERIALIZED (
    SELECT app.metrics_v4_primary_demand_kind(p_tenant_id) AS kind
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), scoped AS MATERIALIZED (
    SELECT
      b.id,
      b.business_name,
      b.contact_name,
      b.external_ref,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '—') AS geography_label,
      b.tier,
      COALESCE(q.invoice_value, 0)::numeric AS spend_qtd,
      COALESCE(q.invoice_count, 0)::bigint AS invoice_count_qtd,
      COALESCE(q.primary_demand_value, 0)::numeric AS demand_value_qtd,
      COALESCE(q.primary_demand_count, 0)::bigint AS demand_count_qtd,
      COALESCE(nowm.receivable_amount, 0)::numeric AS outstanding_due,
      nowm.last_invoice_date::timestamptz AS last_invoice_at,
      NULL::timestamptz AS last_primary_demand_at,
      (cm.buyer_id IS NOT NULL) AS is_member,
      app.derive_buyer_app_status(COALESCE(b.is_active, true), COALESCE(b.buyer_app_enabled, false)) AS buyer_app_status,
      pk.kind AS primary_demand_kind,
      ts_rank_cd(b.search_vector, COALESCE(t.exact_query, t.prefix_query)) AS rank
    FROM app.buyers b
    CROSS JOIN primary_kind pk
    CROSS JOIN query_terms t
    CROSS JOIN bounds bd
    LEFT JOIN app.cohort_members cm ON cm.cohort_id = p_cohort_id AND cm.buyer_id = b.id AND cm.valid_until IS NULL
    LEFT JOIN app.cohorts c ON c.id = p_cohort_id AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary q
      ON q.tenant_id = p_tenant_id AND q.buyer_id = b.id AND q.grain = 'quarter' AND q.period_start = bd.period_start AND q.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_now_summary nowm
      ON nowm.tenant_id = p_tenant_id AND nowm.buyer_id = b.id AND nowm.deleted_at IS NULL
    WHERE c.id IS NOT NULL
      AND b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND (t.exact_query IS NULL OR b.search_vector @@ t.exact_query OR b.search_vector @@ t.prefix_query)
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_invoice_this_quarter), 0) = 0
        OR ('purchased' = ANY(p_invoice_this_quarter) AND invoice_count_qtd > 0)
        OR ('not_purchased' = ANY(p_invoice_this_quarter) AND invoice_count_qtd = 0))
      AND (COALESCE(cardinality(p_demand_this_quarter), 0) = 0
        OR ('has_demand' = ANY(p_demand_this_quarter) AND demand_count_qtd > 0)
        OR ('no_demand' = ANY(p_demand_this_quarter) AND demand_count_qtd = 0))
      AND (COALESCE(cardinality(p_buyer_app), 0) = 0 OR buyer_app_status = ANY(p_buyer_app))
  )
  SELECT
    f.id, f.business_name, f.contact_name, f.external_ref, f.geography_label, f.tier,
    f.spend_qtd, f.invoice_count_qtd, f.demand_value_qtd, f.demand_count_qtd,
    f.outstanding_due, f.last_invoice_at, f.last_primary_demand_at, f.is_member,
    f.buyer_app_status, f.primary_demand_kind,
    f.spend_qtd, f.demand_count_qtd,
    CASE WHEN f.demand_count_qtd > 0 THEN ROUND(f.demand_value_qtd / f.demand_count_qtd, 2) ELSE 0 END,
    f.outstanding_due, f.last_invoice_at,
    count(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'invoices_desc' THEN f.invoice_count_qtd END DESC,
    CASE WHEN p_sort = 'demand_desc' THEN f.demand_value_qtd END DESC,
    CASE WHEN p_sort = 'name_asc' THEN f.business_name END ASC,
    CASE WHEN p_sort = 'last_invoice_desc' THEN f.last_invoice_at END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('invoices_desc', 'demand_desc', 'name_asc', 'last_invoice_desc') THEN f.spend_qtd END DESC,
    f.business_name,
    f.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

DROP FUNCTION IF EXISTS app.search_catalog_buyers(uuid, uuid, text, text, text[], text[], text[], text[], text, integer, integer);

CREATE OR REPLACE FUNCTION app.search_catalog_buyers(
  p_tenant_id uuid,
  p_catalog_id uuid,
  p_query text DEFAULT NULL,
  p_member text DEFAULT 'yes',
  p_status text[] DEFAULT NULL,
  p_invoice_this_quarter text[] DEFAULT NULL,
  p_demand_this_quarter text[] DEFAULT NULL,
  p_buyer_app text[] DEFAULT NULL,
  p_sort text DEFAULT 'gmv_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  buyer_id uuid,
  buyer_name text,
  city text,
  geography_label text,
  cohort_label text,
  opened_status text,
  demand_value numeric,
  demand_count bigint,
  last_opened_at timestamptz,
  last_conversion_at timestamptz,
  last_primary_demand_at timestamptz,
  is_member boolean,
  buyer_app_status text,
  primary_demand_kind text,
  total_count bigint,
  opens_count bigint,
  converted_count bigint,
  attributed_gmv numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '10s'
AS $$
  WITH bounds AS MATERIALIZED (
    SELECT * FROM app.metrics_v4_period_bounds('this_quarter', now())
  ), primary_kind AS MATERIALIZED (
    SELECT app.metrics_v4_primary_demand_kind(p_tenant_id) AS kind
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), catalog AS MATERIALIZED (
    SELECT c.id, c.scope_type, c.scope_value
    FROM app.campaigns c
    WHERE c.id = p_catalog_id
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ), member_ids AS MATERIALIZED (
    SELECT b.id
    FROM catalog c
    JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    WHERE (c.scope_type <> 'all' OR b.is_active)
      AND (c.scope_type = 'all'
       OR (c.scope_type = 'buyer' AND (
         b.id::text = c.scope_value ->> 'buyer_id'
         OR b.id::text IN (SELECT jsonb_array_elements_text(COALESCE(c.scope_value -> 'buyer_ids', '[]'::jsonb)))
       ))
       OR (c.scope_type = 'geography' AND (
         COALESCE(b.geography ->> 'city', '') = COALESCE(c.scope_value ->> 'city', c.scope_value ->> 'value', '')
         OR COALESCE(b.geography ->> 'state', '') = COALESCE(c.scope_value ->> 'state', c.scope_value ->> 'value', '')
       )))
    UNION
    SELECT cm.buyer_id
    FROM catalog c
    JOIN app.cohort_members cm ON cm.cohort_id::text = c.scope_value ->> 'cohort_id' AND cm.valid_until IS NULL
    WHERE c.scope_type = 'cohort'
    UNION
    SELECT cbm.buyer_id
    FROM catalog c
    JOIN app.campaign_buyer_members cbm ON cbm.campaign_id = c.id AND cbm.valid_until IS NULL
  ), views AS MATERIALIZED (
    SELECT cv.buyer_id, max(cv.viewed_at) AS last_opened_at
    FROM app.campaign_views cv
    WHERE cv.tenant_id = p_tenant_id
      AND cv.campaign_id = p_catalog_id
      AND cv.deleted_at IS NULL
    GROUP BY cv.buyer_id
  ), conversions AS MATERIALIZED (
    SELECT x.buyer_id, count(*)::bigint AS conversions, sum(x.amount)::numeric AS spend, max(x.converted_at) AS last_conversion_at
    FROM (
      SELECT o.id, o.buyer_id,
        sum(COALESCE(oi.line_total, COALESCE(oi.qty, 0) * COALESCE(oi.unit_price, 0)))::numeric AS amount,
        max(COALESCE(o.order_date::timestamptz, o.placed_at, o.created_at)) AS converted_at
      FROM app.orders o
      JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = oi.tenant_product_id AND ci.deleted_at IS NULL
      WHERE o.tenant_id = p_tenant_id
        AND o.campaign_id = p_catalog_id
        AND o.deleted_at IS NULL
        AND app.order_status_in_flow(o.status)
      GROUP BY o.id, o.buyer_id
      UNION ALL
      SELECT e.id, e.buyer_id,
        sum(COALESCE(ei.line_total, COALESCE(ei.qty, 0) * COALESCE(ei.unit_price, 0)))::numeric AS amount,
        max(COALESCE(e.estimate_date::timestamptz, e.created_at)) AS converted_at
      FROM app.estimates e
      JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = ei.tenant_product_id AND ci.deleted_at IS NULL
      WHERE e.tenant_id = p_tenant_id
        AND e.campaign_id = p_catalog_id
        AND e.deleted_at IS NULL
        AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
        AND e.converted_to_order_id IS NULL
      GROUP BY e.id, e.buyer_id
    ) x
    GROUP BY x.buyer_id
  ), scoped AS MATERIALIZED (
    SELECT
      b.id AS buyer_id,
      b.business_name AS buyer_name,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '') AS city,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '—') AS geography_label,
      COALESCE(ch.name, CASE WHEN c.scope_type = 'all' THEN 'All buyers' ELSE 'Targeted buyers' END) AS cohort_label,
      CASE WHEN COALESCE(cv.conversions, 0) > 0 THEN 'CONVERTED'
           WHEN v.last_opened_at IS NOT NULL THEN 'OPENED'
           ELSE 'NOT YET OPENED' END AS opened_status,
      COALESCE(q.primary_demand_value, 0)::numeric AS demand_value,
      COALESCE(q.primary_demand_count, 0)::bigint AS demand_count,
      COALESCE(q.invoice_count, 0)::bigint AS invoice_count_qtd,
      v.last_opened_at,
      cv.last_conversion_at,
      NULL::timestamptz AS last_primary_demand_at,
      (m.id IS NOT NULL) AS is_member,
      app.derive_buyer_app_status(COALESCE(b.is_active, true), COALESCE(b.buyer_app_enabled, false)) AS buyer_app_status,
      pk.kind AS primary_demand_kind,
      ts_rank_cd(b.search_vector, COALESCE(t.exact_query, t.prefix_query)) AS rank
    FROM catalog c
    CROSS JOIN primary_kind pk
    CROSS JOIN query_terms t
    CROSS JOIN bounds bd
    JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    LEFT JOIN member_ids m ON m.id = b.id
    LEFT JOIN app.cohorts ch ON ch.id::text = c.scope_value ->> 'cohort_id' AND ch.deleted_at IS NULL
    LEFT JOIN views v ON v.buyer_id = b.id
    LEFT JOIN conversions cv ON cv.buyer_id = b.id
    LEFT JOIN app.metrics_buyer_period_summary q
      ON q.tenant_id = p_tenant_id AND q.buyer_id = b.id AND q.grain = 'quarter' AND q.period_start = bd.period_start AND q.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_now_summary nowm
      ON nowm.tenant_id = p_tenant_id AND nowm.buyer_id = b.id AND nowm.deleted_at IS NULL
    WHERE (t.exact_query IS NULL OR b.search_vector @@ t.exact_query OR b.search_vector @@ t.prefix_query)
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_status), 0) = 0 OR opened_status = ANY(p_status))
      AND (COALESCE(cardinality(p_invoice_this_quarter), 0) = 0
        OR ('purchased' = ANY(p_invoice_this_quarter) AND invoice_count_qtd > 0)
        OR ('not_purchased' = ANY(p_invoice_this_quarter) AND invoice_count_qtd = 0))
      AND (COALESCE(cardinality(p_demand_this_quarter), 0) = 0
        OR ('has_demand' = ANY(p_demand_this_quarter) AND demand_count > 0)
        OR ('no_demand' = ANY(p_demand_this_quarter) AND demand_count = 0))
      AND (COALESCE(cardinality(p_buyer_app), 0) = 0 OR buyer_app_status = ANY(p_buyer_app))
  ), totals AS MATERIALIZED (
    SELECT count(*) FILTER (WHERE opened_status <> 'NOT YET OPENED')::bigint AS opens_count,
           count(*) FILTER (WHERE opened_status = 'CONVERTED')::bigint AS converted_count,
           COALESCE(sum(demand_value), 0)::numeric AS attributed_gmv
    FROM filtered
  )
  SELECT
    f.buyer_id, f.buyer_name, f.city, f.geography_label, f.cohort_label, f.opened_status,
    f.demand_value, f.demand_count, f.last_opened_at, f.last_conversion_at, f.last_primary_demand_at,
    f.is_member, f.buyer_app_status, f.primary_demand_kind,
    count(*) OVER ()::bigint, t.opens_count, t.converted_count, t.attributed_gmv
  FROM filtered f
  CROSS JOIN totals t
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'conversions_desc' THEN f.demand_count END DESC,
    CASE WHEN p_sort = 'recently_opened' THEN f.last_opened_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN f.buyer_name END ASC,
    CASE WHEN p_sort NOT IN ('conversions_desc', 'recently_opened', 'name_asc') THEN f.demand_value END DESC,
    f.buyer_name,
    f.buyer_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
SELECT tenant_id, 'cohort', id, 'v4_rule_migration'
FROM app.cohorts
WHERE membership_mode = 'automatic' AND deleted_at IS NULL
ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
SELECT tenant_id, 'campaign_buyers', id, 'v4_rule_migration'
FROM app.campaigns
WHERE buyer_target_mode = 'automatic' AND deleted_at IS NULL
ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
SELECT tenant_id, 'price_list', id, 'v4_rule_migration'
FROM app.price_lists
WHERE membership_mode = 'automatic' AND deleted_at IS NULL
ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
SELECT tenant_id, 'campaign_products', id, 'v4_rule_migration'
FROM app.campaigns
WHERE product_membership_mode = 'automatic' AND deleted_at IS NULL
ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

REVOKE EXECUTE ON FUNCTION app.membership_mark_candidate_dirty(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.membership_enqueue_time_boundary_refresh(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.membership_mark_candidate_dirty(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.membership_enqueue_time_boundary_refresh(text) TO service_role;
GRANT EXECUTE ON FUNCTION app.membership_normalize_buyer_rules(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.membership_normalize_product_rules(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.membership_buyer_has_invoice_this_quarter(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app.membership_buyer_has_demand_this_quarter(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app.membership_product_sold_this_quarter(uuid, uuid, timestamptz) TO service_role;
