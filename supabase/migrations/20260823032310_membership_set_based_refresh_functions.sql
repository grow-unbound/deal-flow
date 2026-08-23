-- Problem 2b (membership perf/scale fix): rewrite the four automatic-membership
-- "refresh one entity" RPCs from a row-by-row PL/pgSQL loop into a single set-based
-- statement per entity.
--
-- Why: the previous bodies (20260809113501_realtime_membership_v4_cleanup.sql) looped
-- every buyer/product in the tenant and, for each row, called evaluate_buyer_for_* /
-- evaluate_product_for_*, which THEMSELVES re-loop every automatic cohort/campaign/
-- price_list in the tenant. That's O(buyers x automatic-entities) work to refresh a
-- SINGLE entity's membership -- for Wine Yard (11,670 buyers) this is too slow to
-- finish inside the synchronous HTTP request that already calls these RPCs on
-- create/update (app/api/tenant/catalogs/route.ts, app/api/cohorts/route.ts, etc.),
-- so the sync call silently fails/times out and membership is left stuck on the
-- (starved) async queue -- see 20260823032311 for the queue-side fix.
--
-- These rewrites evaluate ONLY the target entity's own rule set directly against
-- app.buyers / app.tenant_products in one CTE-based statement (close stale rows +
-- insert new matches atomically), and are correspondingly O(buyers) or O(products)
-- per call -- sub-second even at tens of thousands of rows. Signatures are unchanged
-- so no caller (API routes, membership_refresh_tick, trg_membership_target_dirty)
-- needs to change.
--
-- The buyer_candidate / product_candidate evaluators (evaluate_buyer_for_cohorts_v2,
-- evaluate_buyer_for_campaign_buyers, evaluate_product_for_price_lists_v2,
-- evaluate_product_for_campaigns_v2) are intentionally left untouched: those are
-- meant to fan out across all automatic entities for ONE changed buyer/product, which
-- is a small, correct fan-out (few automatic entities per tenant), not the O(buyers)
-- multiplier these refresh_*_by_id functions had.

CREATE OR REPLACE FUNCTION app.refresh_cohort_by_id(p_cohort_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_rules jsonb;
  v_now timestamptz := now();
BEGIN
  SELECT tenant_id, app.membership_normalize_buyer_rules(rules)
  INTO v_tenant_id, v_rules
  FROM app.cohorts
  WHERE id = p_cohort_id AND membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH matched AS (
    SELECT b.id AS buyer_id
    FROM app.buyers b
    WHERE b.tenant_id = v_tenant_id
      AND b.deleted_at IS NULL
      AND COALESCE(b.is_active, true)
      AND (NOT (v_rules ? 'buyer_app_status')
           OR app.derive_buyer_app_status(b.is_active, b.buyer_app_enabled) = v_rules ->> 'buyer_app_status')
      AND (NOT (v_rules ? 'invoice_status_this_quarter')
           OR (v_rules ->> 'invoice_status_this_quarter' = 'purchased')
               = app.membership_buyer_has_invoice_this_quarter(v_tenant_id, b.id, v_now))
      AND (NOT (v_rules ? 'demand_status_this_quarter')
           OR (v_rules ->> 'demand_status_this_quarter' = 'has_demand')
               = app.membership_buyer_has_demand_this_quarter(v_tenant_id, b.id, v_now))
  ),
  closed AS (
    UPDATE app.cohort_members cm
    SET valid_until = v_now
    WHERE cm.cohort_id = p_cohort_id
      AND cm.valid_until IS NULL
      AND NOT EXISTS (SELECT 1 FROM matched m WHERE m.buyer_id = cm.buyer_id)
    RETURNING cm.buyer_id
  )
  INSERT INTO app.cohort_members (cohort_id, buyer_id, valid_from)
  SELECT p_cohort_id, m.buyer_id, v_now
  FROM matched m
  WHERE NOT EXISTS (
    SELECT 1 FROM app.cohort_members cm2
    WHERE cm2.cohort_id = p_cohort_id AND cm2.buyer_id = m.buyer_id AND cm2.valid_until IS NULL
  );

  UPDATE app.cohorts c
  SET cached_member_count = (SELECT COUNT(*) FROM app.cohort_members_active WHERE cohort_id = c.id),
      last_refreshed_at = v_now
  WHERE c.id = p_cohort_id;
END;
$function$;

CREATE OR REPLACE FUNCTION app.refresh_campaign_buyers_by_id(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_rules jsonb;
  v_now timestamptz := now();
BEGIN
  SELECT tenant_id, app.membership_normalize_buyer_rules(buyer_filter_rules)
  INTO v_tenant_id, v_rules
  FROM app.campaigns
  WHERE id = p_campaign_id AND buyer_target_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH matched AS (
    SELECT b.id AS buyer_id
    FROM app.buyers b
    WHERE b.tenant_id = v_tenant_id
      AND b.deleted_at IS NULL
      AND COALESCE(b.is_active, true)
      AND (NOT (v_rules ? 'buyer_app_status')
           OR app.derive_buyer_app_status(b.is_active, b.buyer_app_enabled) = v_rules ->> 'buyer_app_status')
      AND (NOT (v_rules ? 'invoice_status_this_quarter')
           OR (v_rules ->> 'invoice_status_this_quarter' = 'purchased')
               = app.membership_buyer_has_invoice_this_quarter(v_tenant_id, b.id, v_now))
      AND (NOT (v_rules ? 'demand_status_this_quarter')
           OR (v_rules ->> 'demand_status_this_quarter' = 'has_demand')
               = app.membership_buyer_has_demand_this_quarter(v_tenant_id, b.id, v_now))
  ),
  closed AS (
    UPDATE app.campaign_buyer_members cbm
    SET valid_until = v_now
    WHERE cbm.campaign_id = p_campaign_id
      AND cbm.valid_until IS NULL
      AND NOT EXISTS (SELECT 1 FROM matched m WHERE m.buyer_id = cbm.buyer_id)
    RETURNING cbm.buyer_id
  )
  INSERT INTO app.campaign_buyer_members (campaign_id, buyer_id, valid_from)
  SELECT p_campaign_id, m.buyer_id, v_now
  FROM matched m
  WHERE NOT EXISTS (
    SELECT 1 FROM app.campaign_buyer_members cbm2
    WHERE cbm2.campaign_id = p_campaign_id AND cbm2.buyer_id = m.buyer_id AND cbm2.valid_until IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.refresh_campaign_products_by_id(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_rules jsonb;
  v_now timestamptz := now();
BEGIN
  SELECT tenant_id, app.membership_normalize_product_rules(dynamic_rules)
  INTO v_tenant_id, v_rules
  FROM app.campaigns
  WHERE id = p_campaign_id AND product_membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH latest_inventory AS (
    SELECT DISTINCT ON (ti.tenant_product_id)
      ti.tenant_product_id, ti.qty_available, ti.reorder_point
    FROM app.tenant_inventory ti
    WHERE ti.deleted_at IS NULL
    ORDER BY ti.tenant_product_id, ti.updated_at DESC
  ),
  matched AS (
    SELECT tp.id AS tenant_product_id
    FROM app.tenant_products tp
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
    LEFT JOIN latest_inventory li ON li.tenant_product_id = tp.id
    WHERE tp.tenant_id = v_tenant_id
      AND tp.deleted_at IS NULL
      AND app.membership_text_filter_matches(v_rules -> 'brand_names', tp.tenant_brand_id::text, COALESCE(tb.display_name_override, b.name))
      AND app.membership_text_filter_matches(v_rules -> 'category_names', tp.tenant_category_id::text, tc.name)
      AND (NOT (v_rules ? 'stock_status')
           OR v_rules ->> 'stock_status' = app.derive_stock_status_bucket(
                 li.qty_available, li.reorder_point, app.product_is_new_stock_today(tp.id)))
      AND (NOT (v_rules ? 'sales_status_this_quarter')
           OR (v_rules ->> 'sales_status_this_quarter' = 'sold')
               = app.membership_product_sold_this_quarter(v_tenant_id, tp.id, v_now))
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
END;
$function$;

CREATE OR REPLACE FUNCTION app.refresh_price_list_by_id(p_price_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_rules jsonb;
  v_pricing_strategy text;
  v_strategy_value numeric;
  v_now timestamptz := now();
BEGIN
  SELECT tenant_id, app.membership_normalize_product_rules(filters), pricing_strategy, strategy_value
  INTO v_tenant_id, v_rules, v_pricing_strategy, v_strategy_value
  FROM app.price_lists
  WHERE id = p_price_list_id AND membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND OR v_pricing_strategy = 'edit_each' THEN
    -- 'edit_each' price lists never carry auto-computed items even under automatic
    -- membership -- matches the CONTINUE-skip in evaluate_product_for_price_lists_v2.
    RETURN;
  END IF;

  WITH latest_inventory AS (
    SELECT DISTINCT ON (ti.tenant_product_id)
      ti.tenant_product_id, ti.qty_available, ti.reorder_point
    FROM app.tenant_inventory ti
    WHERE ti.deleted_at IS NULL
    ORDER BY ti.tenant_product_id, ti.updated_at DESC
  ),
  matched AS (
    SELECT tp.id AS tenant_product_id, tp.base_selling_price, tp.mrp
    FROM app.tenant_products tp
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands b ON b.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
    LEFT JOIN latest_inventory li ON li.tenant_product_id = tp.id
    WHERE tp.tenant_id = v_tenant_id
      AND tp.deleted_at IS NULL
      AND app.membership_text_filter_matches(v_rules -> 'brand_names', tp.tenant_brand_id::text, COALESCE(tb.display_name_override, b.name))
      AND app.membership_text_filter_matches(v_rules -> 'category_names', tp.tenant_category_id::text, tc.name)
      AND (NOT (v_rules ? 'stock_status')
           OR v_rules ->> 'stock_status' = app.derive_stock_status_bucket(
                 li.qty_available, li.reorder_point, app.product_is_new_stock_today(tp.id)))
      AND (NOT (v_rules ? 'sales_status_this_quarter')
           OR (v_rules ->> 'sales_status_this_quarter' = 'sold')
               = app.membership_product_sold_this_quarter(v_tenant_id, tp.id, v_now))
  ),
  closed AS (
    UPDATE app.price_list_items pli
    SET deleted_at = v_now
    WHERE pli.price_list_id = p_price_list_id
      AND pli.min_qty = 1
      AND pli.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM matched m WHERE m.tenant_product_id = pli.tenant_product_id)
    RETURNING pli.tenant_product_id
  )
  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, valid_from)
  SELECT
    p_price_list_id,
    m.tenant_product_id,
    GREATEST(
      CASE v_pricing_strategy
        WHEN 'margin_from_mrp' THEN COALESCE(m.mrp, 0) * (1 - COALESCE(v_strategy_value, 0) / 100)
        WHEN 'flat_off_base' THEN COALESCE(m.base_selling_price, 0) - COALESCE(v_strategy_value, 0)
        WHEN 'percentage' THEN COALESCE(m.base_selling_price, 0) * (1 - COALESCE(v_strategy_value, 0) / 100)
        WHEN 'per_item' THEN COALESCE(v_strategy_value, 0)
        ELSE COALESCE(m.base_selling_price, 0)
      END, 0),
    1,
    v_now
  FROM matched m
  ON CONFLICT (price_list_id, tenant_product_id, min_qty)
  DO UPDATE SET
    price = EXCLUDED.price,
    valid_from = CASE WHEN app.price_list_items.deleted_at IS NOT NULL THEN v_now ELSE app.price_list_items.valid_from END,
    deleted_at = NULL;
END;
$function$;
