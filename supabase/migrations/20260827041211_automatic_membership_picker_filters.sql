-- Automatic-membership rules: adopt the search-overlay picker's quick-filter/advanced-filter
-- vocabulary (src/lib/picker-filters.ts) as a NEW, purely additive rule shape alongside the
-- existing dropdown-driven fields (buyer_app_status/demand_status_this_quarter/
-- invoice_status_this_quarter for buyers; brand_names/category_names/stock_status/
-- sales_status_this_quarter for products). Old fields and their evaluation are untouched --
-- already-saved automatic cohorts/price lists/campaigns keep working exactly as before. The
-- new fields (quick_filters, status, buyer_app, outstanding, sales_location_id for buyers;
-- quick_filters, stock, status, brand_ids, category_ids for products) are ANDed alongside the
-- old fields wherever both happen to be present on one rules object.
--
-- Predicate semantics mirror app.search_cohort_composer_buyers / app.search_picker_products
-- (the manual picker RPCs) exactly -- same quick-filter -> boolean-expression mapping, not
-- redefined here.
--
-- top20 (whole-set relative rank, cannot be evaluated for a single changed row):
--   - The 4 whole-set app.refresh_*_by_id functions compute it correctly via a percent_rank()
--     CTE over the entity's own already-rule-filtered candidate set.
--   - The 4 per-row realtime app.evaluate_*_v2/app.evaluate_buyer_for_campaign_buyers functions
--     cannot evaluate it for one row; when an entity's rules include top20, the per-entity loop
--     branch skips incremental matching for that entity and calls app.membership_mark_dirty(...)
--     instead, deferring to the next app.membership_refresh_tick() -> refresh_*_by_id pass.
--
-- status='inactive' (buyers only): app.evaluate_buyer_for_cohorts_v2 / app.evaluate_buyer_for_campaign_buyers
--   already unconditionally close ALL of a buyer's automatic memberships the moment that buyer
--   goes inactive (existing behavior, untouched) -- so a rule that deliberately *targets*
--   inactive buyers can never be satisfied by that realtime path (the buyer never reaches the
--   per-cohort loop once inactive). Such a rule still converges correctly via the whole-set
--   app.refresh_cohort_by_id / app.refresh_campaign_buyers_by_id (extended here to flip their
--   base eligibility filter to inactive-only when requested), i.e. within one
--   app.membership_refresh_tick() cycle -- same class of async-convergence caveat as top20.
--   Products have no such early-return, so product status='inactive' works instantly via the
--   realtime path too.

-- =============================================================================================
-- 1. Normalize functions -- pass the new fields through untouched (no upgrade logic needed,
--    they're already canonical-shaped). Without this, membership_normalize_* would silently
--    strip them before every evaluator/refresher/preview function sees them, since v_next
--    starts as '{}'::jsonb and only copies keys it explicitly recognizes.
-- =============================================================================================

CREATE OR REPLACE FUNCTION app.membership_normalize_buyer_rules(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
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

  IF v_rules ? 'quick_filters' THEN
    v_next := jsonb_set(v_next, '{quick_filters}', COALESCE(v_rules -> 'quick_filters', '[]'::jsonb), true);
  END IF;

  IF v_rules ? 'status' THEN
    v_next := jsonb_set(v_next, '{status}', to_jsonb(v_rules ->> 'status'), true);
  END IF;

  IF v_rules ? 'buyer_app' THEN
    v_next := jsonb_set(v_next, '{buyer_app}', to_jsonb(v_rules ->> 'buyer_app'), true);
  END IF;

  IF v_rules ? 'outstanding' THEN
    v_next := jsonb_set(v_next, '{outstanding}', to_jsonb(v_rules ->> 'outstanding'), true);
  END IF;

  IF v_rules ? 'sales_location_id' THEN
    v_next := jsonb_set(v_next, '{sales_location_id}', to_jsonb(v_rules ->> 'sales_location_id'), true);
  END IF;

  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION app.membership_normalize_product_rules(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
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

  IF v_rules ? 'quick_filters' THEN
    v_next := jsonb_set(v_next, '{quick_filters}', COALESCE(v_rules -> 'quick_filters', '[]'::jsonb), true);
  END IF;

  IF v_rules ? 'stock' THEN
    v_next := jsonb_set(v_next, '{stock}', to_jsonb(v_rules ->> 'stock'), true);
  END IF;

  IF v_rules ? 'status' THEN
    v_next := jsonb_set(v_next, '{status}', to_jsonb(v_rules ->> 'status'), true);
  END IF;

  IF v_rules ? 'brand_ids' THEN
    v_next := jsonb_set(v_next, '{brand_ids}', COALESCE(v_rules -> 'brand_ids', '[]'::jsonb), true);
  END IF;

  IF v_rules ? 'category_ids' THEN
    v_next := jsonb_set(v_next, '{category_ids}', COALESCE(v_rules -> 'category_ids', '[]'::jsonb), true);
  END IF;

  RETURN v_next;
END;
$function$;

-- =============================================================================================
-- 2. Preview count functions -- extended for completeness/parity with the Details-tab
--    MembershipFilterPanel (which still calls these), even though the new Add/Edit sheet's own
--    live count uses the picker RPCs directly (search_cohort_composer_buyers/search_picker_products)
--    to guarantee the shown count and the reviewed set can never drift apart.
-- =============================================================================================

CREATE OR REPLACE FUNCTION app.preview_buyer_membership_count(p_tenant_id uuid, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_rules jsonb := app.membership_normalize_buyer_rules(p_rules);
  v_count integer := 0;
  v_sample_names text[] := '{}';
  v_want_inactive boolean := COALESCE(v_rules ->> 'status' = 'inactive', false);
  v_want_top20 boolean := COALESCE(v_rules -> 'quick_filters' ? 'top20', false);
  v_quarter_start date := date_trunc('quarter', CURRENT_DATE)::date;
  v_prev_quarter_start date := (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date;
BEGIN
  WITH scoped AS (
    SELECT
      b.id,
      b.business_name,
      b.buyer_app_enabled,
      app.derive_buyer_app_status(b.is_active, b.buyer_app_enabled) AS buyer_app_status,
      app.membership_buyer_has_invoice_this_quarter(p_tenant_id, b.id) AS has_invoice,
      app.membership_buyer_has_demand_this_quarter(p_tenant_id, b.id) AS has_demand,
      COALESCE(now_s.receivable_amount, 0) AS receivable_amount,
      COALESCE(now_s.overdue_amount, 0) AS overdue_amount,
      COALESCE(period_s.invoice_value, 0) AS invoice_value,
      COALESCE(period_prev_s.invoice_value, 0) AS prev_invoice_value,
      COALESCE(period_s.estimate_value, 0) AS estimate_value,
      COALESCE(period_s.order_value, 0) AS order_value
    FROM app.buyers b
    LEFT JOIN app.metrics_buyer_now_summary now_s
      ON now_s.tenant_id = p_tenant_id AND now_s.buyer_id = b.id AND now_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_s
      ON period_s.tenant_id = p_tenant_id AND period_s.buyer_id = b.id
     AND period_s.grain = 'quarter' AND period_s.period_start = v_quarter_start AND period_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_prev_s
      ON period_prev_s.tenant_id = p_tenant_id AND period_prev_s.buyer_id = b.id
     AND period_prev_s.grain = 'quarter' AND period_prev_s.period_start = v_prev_quarter_start AND period_prev_s.deleted_at IS NULL
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND ((NOT v_want_inactive AND COALESCE(b.is_active, true)) OR (v_want_inactive AND b.is_active = false))
  ), matched_pre AS (
    SELECT *
    FROM scoped s
    WHERE (NOT (v_rules ? 'buyer_app_status') OR s.buyer_app_status = v_rules ->> 'buyer_app_status')
      AND (NOT (v_rules ? 'invoice_status_this_quarter')
        OR (v_rules ->> 'invoice_status_this_quarter' = 'purchased' AND s.has_invoice)
        OR (v_rules ->> 'invoice_status_this_quarter' = 'not_purchased' AND NOT s.has_invoice))
      AND (NOT (v_rules ? 'demand_status_this_quarter')
        OR (v_rules ->> 'demand_status_this_quarter' = 'has_demand' AND s.has_demand)
        OR (v_rules ->> 'demand_status_this_quarter' = 'no_demand' AND NOT s.has_demand))
      AND (
        NOT (v_rules ? 'quick_filters') OR jsonb_array_length(v_rules -> 'quick_filters') = 0
        OR (
          (v_rules -> 'quick_filters' ? 'has_dues' AND s.receivable_amount > 0)
          OR (v_rules -> 'quick_filters' ? 'overdue' AND s.overdue_amount > 0)
          OR (v_rules -> 'quick_filters' ? 'app_enabled' AND s.buyer_app_enabled = true)
          OR (v_rules -> 'quick_filters' ? 'dormant_qtr' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
          OR (v_rules -> 'quick_filters' ? 'buying_qtr' AND s.invoice_value > 0)
          OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (s.estimate_value > 0 OR s.order_value > 0) AND s.invoice_value = 0)
          OR (v_rules -> 'quick_filters' ? 'top20' AND s.invoice_value > 0)
        )
      )
      AND (NOT (v_rules ? 'status')
        OR (v_rules ->> 'status' = 'active' AND s.invoice_value > 0)
        OR (v_rules ->> 'status' = 'dormant' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
        OR (v_rules ->> 'status' = 'inactive'))
      AND (NOT (v_rules ? 'buyer_app')
        OR (v_rules ->> 'buyer_app' = 'enabled' AND s.buyer_app_enabled = true)
        OR (v_rules ->> 'buyer_app' = 'not_enabled' AND s.buyer_app_enabled = false))
      AND (NOT (v_rules ? 'outstanding')
        OR (v_rules ->> 'outstanding' = 'has_dues' AND s.receivable_amount > 0)
        OR (v_rules ->> 'outstanding' = 'overdue' AND s.overdue_amount > 0))
      AND (NOT (v_rules ? 'sales_location_id') OR EXISTS (
        SELECT 1 FROM app.invoices i
        WHERE i.tenant_id = p_tenant_id AND i.buyer_id = s.id
          AND i.location_id = (v_rules ->> 'sales_location_id')::uuid
          AND i.invoice_date >= v_quarter_start AND i.deleted_at IS NULL
      ))
  ), gmv_rank AS (
    SELECT id, percent_rank() OVER (ORDER BY invoice_value DESC) AS pct_rank
    FROM matched_pre WHERE invoice_value > 0
  ), matched AS (
    SELECT mp.*
    FROM matched_pre mp
    LEFT JOIN gmv_rank gr ON gr.id = mp.id
    WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
  )
  SELECT COUNT(*), (SELECT array_agg(business_name ORDER BY business_name) FROM (SELECT business_name FROM matched ORDER BY business_name LIMIT 5) sample)
  INTO v_count, v_sample_names
  FROM matched;

  RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
END;
$function$;

CREATE OR REPLACE FUNCTION app.preview_product_membership_count(p_tenant_id uuid, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_rules jsonb := app.membership_normalize_product_rules(p_rules);
  v_count integer := 0;
  v_sample_names text[] := '{}';
  v_want_inactive boolean := COALESCE(v_rules ->> 'status' = 'inactive', false);
  v_want_top20 boolean := COALESCE(v_rules -> 'quick_filters' ? 'top20', false);
  v_quarter_start date := date_trunc('quarter', CURRENT_DATE)::date;
  v_prev_quarter_start date := (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date;
BEGIN
  WITH inventory_sum AS (
    SELECT tenant_product_id,
      SUM(COALESCE(qty_available, 0))::numeric AS qty_available_total,
      SUM(COALESCE(reorder_point, 0))::numeric AS reorder_point_total
    FROM app.tenant_inventory
    WHERE deleted_at IS NULL
    GROUP BY tenant_product_id
  ), scoped AS (
    SELECT
      tp.id,
      COALESCE(tp.name_override, tp.internal_sku, 'Unnamed product') AS product_name,
      tp.is_active,
      app.derive_stock_status_bucket(ti.qty_available, ti.reorder_point, app.product_is_new_stock_today(tp.id)) AS stock_status,
      app.membership_product_sold_this_quarter(p_tenant_id, tp.id) AS sold_this_quarter,
      tp.tenant_brand_id,
      COALESCE(tb.display_name_override, b.name) AS brand_name,
      tp.tenant_category_id,
      tc.name AS category_name,
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
    LEFT JOIN LATERAL (
      SELECT qty_available, reorder_point
      FROM app.tenant_inventory
      WHERE tenant_product_id = tp.id AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    ) ti ON true
    LEFT JOIN inventory_sum isum ON isum.tenant_product_id = tp.id
    LEFT JOIN app.metrics_product_period_summary mps
      ON mps.tenant_id = p_tenant_id AND mps.tenant_product_id = tp.id
     AND mps.grain = 'quarter' AND mps.period_start = v_quarter_start AND mps.deleted_at IS NULL
    LEFT JOIN app.metrics_product_period_summary mps_prev
      ON mps_prev.tenant_id = p_tenant_id AND mps_prev.tenant_product_id = tp.id
     AND mps_prev.grain = 'quarter' AND mps_prev.period_start = v_prev_quarter_start AND mps_prev.deleted_at IS NULL
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND ((NOT v_want_inactive AND COALESCE(tp.is_active, true)) OR (v_want_inactive AND tp.is_active = false))
  ), matched_pre AS (
    SELECT *
    FROM scoped s
    WHERE app.membership_text_filter_matches(v_rules -> 'brand_names', s.tenant_brand_id::text, s.brand_name)
      AND app.membership_text_filter_matches(v_rules -> 'category_names', s.tenant_category_id::text, s.category_name)
      AND (NOT (v_rules ? 'stock_status') OR s.stock_status = v_rules ->> 'stock_status')
      AND (NOT (v_rules ? 'sales_status_this_quarter')
        OR (v_rules ->> 'sales_status_this_quarter' = 'sold' AND s.sold_this_quarter)
        OR (v_rules ->> 'sales_status_this_quarter' = 'not_sold' AND NOT s.sold_this_quarter))
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
  ), gmv_rank AS (
    SELECT id, percent_rank() OVER (ORDER BY invoice_value DESC) AS pct_rank
    FROM matched_pre WHERE invoice_value > 0
  ), matched AS (
    SELECT mp.* FROM matched_pre mp LEFT JOIN gmv_rank gr ON gr.id = mp.id
    WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
  )
  SELECT COUNT(*), (SELECT array_agg(product_name ORDER BY product_name) FROM (SELECT product_name FROM matched ORDER BY product_name LIMIT 5) sample)
  INTO v_count, v_sample_names
  FROM matched;

  RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
END;
$function$;

-- =============================================================================================
-- 3. Per-row realtime evaluators -- extended predicate branches (all new keys except top20,
--    which defers to the async tick per the header note above).
-- =============================================================================================

CREATE OR REPLACE FUNCTION app.evaluate_buyer_for_cohorts_v2(p_buyer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_buyer record;
  v_rules jsonb;
  v_matches boolean;
  v_has_invoice boolean := false;
  v_has_demand boolean := false;
  v_buyer_app_status text;
  v_cohort record;
  v_now timestamptz := now();
  v_receivable numeric;
  v_overdue_amt numeric;
  v_invoice_value numeric;
  v_prev_invoice_value numeric;
  v_estimate_value numeric;
  v_order_value numeric;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
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

  SELECT COALESCE(receivable_amount, 0), COALESCE(overdue_amount, 0)
  INTO v_receivable, v_overdue_amt
  FROM app.metrics_buyer_now_summary
  WHERE tenant_id = v_buyer.tenant_id AND buyer_id = p_buyer_id AND deleted_at IS NULL;
  v_receivable := COALESCE(v_receivable, 0);
  v_overdue_amt := COALESCE(v_overdue_amt, 0);

  SELECT COALESCE(invoice_value, 0), COALESCE(estimate_value, 0), COALESCE(order_value, 0)
  INTO v_invoice_value, v_estimate_value, v_order_value
  FROM app.metrics_buyer_period_summary
  WHERE tenant_id = v_buyer.tenant_id AND buyer_id = p_buyer_id
    AND grain = 'quarter' AND period_start = v_quarter_start AND deleted_at IS NULL;
  v_invoice_value := COALESCE(v_invoice_value, 0);
  v_estimate_value := COALESCE(v_estimate_value, 0);
  v_order_value := COALESCE(v_order_value, 0);

  SELECT COALESCE(invoice_value, 0) INTO v_prev_invoice_value
  FROM app.metrics_buyer_period_summary
  WHERE tenant_id = v_buyer.tenant_id AND buyer_id = p_buyer_id
    AND grain = 'quarter' AND period_start = v_prev_quarter_start AND deleted_at IS NULL;
  v_prev_invoice_value := COALESCE(v_prev_invoice_value, 0);

  FOR v_cohort IN
    SELECT id, rules
    FROM app.cohorts
    WHERE tenant_id = v_buyer.tenant_id
      AND membership_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules := app.membership_normalize_buyer_rules(v_cohort.rules);

    IF v_rules -> 'quick_filters' ? 'top20' THEN
      PERFORM app.membership_mark_dirty(v_buyer.tenant_id, 'cohort', v_cohort.id, 'top20_defer_to_refresh');
      CONTINUE;
    END IF;

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

    IF v_matches AND v_rules ? 'quick_filters' AND jsonb_array_length(v_rules -> 'quick_filters') > 0 THEN
      IF NOT (
        (v_rules -> 'quick_filters' ? 'has_dues' AND v_receivable > 0)
        OR (v_rules -> 'quick_filters' ? 'overdue' AND v_overdue_amt > 0)
        OR (v_rules -> 'quick_filters' ? 'app_enabled' AND v_buyer.buyer_app_enabled = true)
        OR (v_rules -> 'quick_filters' ? 'dormant_qtr' AND v_invoice_value = 0 AND v_prev_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'buying_qtr' AND v_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (v_estimate_value > 0 OR v_order_value > 0) AND v_invoice_value = 0)
      ) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'status' THEN
      IF (v_rules ->> 'status' = 'active' AND NOT (v_invoice_value > 0))
        OR (v_rules ->> 'status' = 'dormant' AND NOT (v_invoice_value = 0 AND v_prev_invoice_value > 0))
        -- A buyer reaching this loop is always active (see the early-return above) --
        -- status='inactive' rules only converge via refresh_cohort_by_id's whole-set pass.
        OR (v_rules ->> 'status' = 'inactive')
      THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'buyer_app' THEN
      IF (v_rules ->> 'buyer_app' = 'enabled' AND NOT v_buyer.buyer_app_enabled)
        OR (v_rules ->> 'buyer_app' = 'not_enabled' AND v_buyer.buyer_app_enabled) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'outstanding' THEN
      IF (v_rules ->> 'outstanding' = 'has_dues' AND NOT (v_receivable > 0))
        OR (v_rules ->> 'outstanding' = 'overdue' AND NOT (v_overdue_amt > 0)) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'sales_location_id' THEN
      IF NOT EXISTS (
        SELECT 1 FROM app.invoices i
        WHERE i.tenant_id = v_buyer.tenant_id AND i.buyer_id = p_buyer_id
          AND i.location_id = (v_rules ->> 'sales_location_id')::uuid
          AND i.invoice_date >= v_quarter_start AND i.deleted_at IS NULL
      ) THEN
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
$function$;

CREATE OR REPLACE FUNCTION app.evaluate_buyer_for_campaign_buyers(p_buyer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_buyer record;
  v_rules jsonb;
  v_matches boolean;
  v_has_invoice boolean := false;
  v_has_demand boolean := false;
  v_buyer_app_status text;
  v_campaign record;
  v_now timestamptz := now();
  v_receivable numeric;
  v_overdue_amt numeric;
  v_invoice_value numeric;
  v_prev_invoice_value numeric;
  v_estimate_value numeric;
  v_order_value numeric;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
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

  SELECT COALESCE(receivable_amount, 0), COALESCE(overdue_amount, 0)
  INTO v_receivable, v_overdue_amt
  FROM app.metrics_buyer_now_summary
  WHERE tenant_id = v_buyer.tenant_id AND buyer_id = p_buyer_id AND deleted_at IS NULL;
  v_receivable := COALESCE(v_receivable, 0);
  v_overdue_amt := COALESCE(v_overdue_amt, 0);

  SELECT COALESCE(invoice_value, 0), COALESCE(estimate_value, 0), COALESCE(order_value, 0)
  INTO v_invoice_value, v_estimate_value, v_order_value
  FROM app.metrics_buyer_period_summary
  WHERE tenant_id = v_buyer.tenant_id AND buyer_id = p_buyer_id
    AND grain = 'quarter' AND period_start = v_quarter_start AND deleted_at IS NULL;
  v_invoice_value := COALESCE(v_invoice_value, 0);
  v_estimate_value := COALESCE(v_estimate_value, 0);
  v_order_value := COALESCE(v_order_value, 0);

  SELECT COALESCE(invoice_value, 0) INTO v_prev_invoice_value
  FROM app.metrics_buyer_period_summary
  WHERE tenant_id = v_buyer.tenant_id AND buyer_id = p_buyer_id
    AND grain = 'quarter' AND period_start = v_prev_quarter_start AND deleted_at IS NULL;
  v_prev_invoice_value := COALESCE(v_prev_invoice_value, 0);

  FOR v_campaign IN
    SELECT id, buyer_filter_rules
    FROM app.campaigns
    WHERE tenant_id = v_buyer.tenant_id
      AND buyer_target_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules := app.membership_normalize_buyer_rules(v_campaign.buyer_filter_rules);

    IF v_rules -> 'quick_filters' ? 'top20' THEN
      PERFORM app.membership_mark_dirty(v_buyer.tenant_id, 'campaign_buyers', v_campaign.id, 'top20_defer_to_refresh');
      CONTINUE;
    END IF;

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

    IF v_matches AND v_rules ? 'quick_filters' AND jsonb_array_length(v_rules -> 'quick_filters') > 0 THEN
      IF NOT (
        (v_rules -> 'quick_filters' ? 'has_dues' AND v_receivable > 0)
        OR (v_rules -> 'quick_filters' ? 'overdue' AND v_overdue_amt > 0)
        OR (v_rules -> 'quick_filters' ? 'app_enabled' AND v_buyer.buyer_app_enabled = true)
        OR (v_rules -> 'quick_filters' ? 'dormant_qtr' AND v_invoice_value = 0 AND v_prev_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'buying_qtr' AND v_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (v_estimate_value > 0 OR v_order_value > 0) AND v_invoice_value = 0)
      ) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'status' THEN
      IF (v_rules ->> 'status' = 'active' AND NOT (v_invoice_value > 0))
        OR (v_rules ->> 'status' = 'dormant' AND NOT (v_invoice_value = 0 AND v_prev_invoice_value > 0))
        OR (v_rules ->> 'status' = 'inactive')
      THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'buyer_app' THEN
      IF (v_rules ->> 'buyer_app' = 'enabled' AND NOT v_buyer.buyer_app_enabled)
        OR (v_rules ->> 'buyer_app' = 'not_enabled' AND v_buyer.buyer_app_enabled) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'outstanding' THEN
      IF (v_rules ->> 'outstanding' = 'has_dues' AND NOT (v_receivable > 0))
        OR (v_rules ->> 'outstanding' = 'overdue' AND NOT (v_overdue_amt > 0)) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'sales_location_id' THEN
      IF NOT EXISTS (
        SELECT 1 FROM app.invoices i
        WHERE i.tenant_id = v_buyer.tenant_id AND i.buyer_id = p_buyer_id
          AND i.location_id = (v_rules ->> 'sales_location_id')::uuid
          AND i.invoice_date >= v_quarter_start AND i.deleted_at IS NULL
      ) THEN
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
$function$;

CREATE OR REPLACE FUNCTION app.evaluate_product_for_price_lists_v2(p_tenant_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
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
  v_qty_available_total numeric;
  v_effective_threshold numeric;
  v_invoice_value numeric;
  v_prev_invoice_value numeric;
  v_estimate_value numeric;
  v_order_value numeric;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
BEGIN
  SELECT tp.id, tp.tenant_id, tp.tenant_brand_id, tp.tenant_category_id, tp.is_active,
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

  SELECT COALESCE(SUM(qty_available), 0), COALESCE(NULLIF(SUM(reorder_point), 0), 10)
  INTO v_qty_available_total, v_effective_threshold
  FROM app.tenant_inventory
  WHERE tenant_product_id = p_tenant_product_id AND deleted_at IS NULL;
  v_qty_available_total := COALESCE(v_qty_available_total, 0);
  v_effective_threshold := COALESCE(v_effective_threshold, 10);

  SELECT COALESCE(invoice_value, 0), COALESCE(estimate_value, 0), COALESCE(order_value, 0)
  INTO v_invoice_value, v_estimate_value, v_order_value
  FROM app.metrics_product_period_summary
  WHERE tenant_id = v_product.tenant_id AND tenant_product_id = p_tenant_product_id
    AND grain = 'quarter' AND period_start = v_quarter_start AND deleted_at IS NULL;
  v_invoice_value := COALESCE(v_invoice_value, 0);
  v_estimate_value := COALESCE(v_estimate_value, 0);
  v_order_value := COALESCE(v_order_value, 0);

  SELECT COALESCE(invoice_value, 0) INTO v_prev_invoice_value
  FROM app.metrics_product_period_summary
  WHERE tenant_id = v_product.tenant_id AND tenant_product_id = p_tenant_product_id
    AND grain = 'quarter' AND period_start = v_prev_quarter_start AND deleted_at IS NULL;
  v_prev_invoice_value := COALESCE(v_prev_invoice_value, 0);

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

    IF v_rules -> 'quick_filters' ? 'top20' THEN
      PERFORM app.membership_mark_dirty(v_product.tenant_id, 'price_list', v_price_list.id, 'top20_defer_to_refresh');
      CONTINUE;
    END IF;

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

    IF v_matches AND v_rules ? 'quick_filters' AND jsonb_array_length(v_rules -> 'quick_filters') > 0 THEN
      IF NOT (
        (v_rules -> 'quick_filters' ? 'selling_oos' AND v_invoice_value > 0 AND v_qty_available_total = 0)
        OR (v_rules -> 'quick_filters' ? 'selling_low_stock' AND v_invoice_value > 0 AND v_qty_available_total < v_effective_threshold)
        OR (v_rules -> 'quick_filters' ? 'selling_qtr' AND v_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'not_selling_qtr' AND v_invoice_value = 0 AND v_prev_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (v_estimate_value > 0 OR v_order_value > 0) AND v_invoice_value = 0)
      ) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'stock' THEN
      IF (v_rules ->> 'stock' = 'in_stock' AND NOT (v_qty_available_total >= v_effective_threshold))
        OR (v_rules ->> 'stock' = 'low_stock' AND NOT (v_qty_available_total > 0 AND v_qty_available_total < v_effective_threshold))
        OR (v_rules ->> 'stock' = 'out_of_stock' AND NOT (v_qty_available_total = 0)) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'status' THEN
      IF (v_rules ->> 'status' = 'active' AND NOT (v_invoice_value > 0))
        OR (v_rules ->> 'status' = 'dormant' AND NOT (v_invoice_value = 0 AND v_prev_invoice_value > 0))
        OR (v_rules ->> 'status' = 'inactive' AND COALESCE(v_product.is_active, true)) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'brand_ids' AND jsonb_array_length(v_rules -> 'brand_ids') > 0 THEN
      IF NOT (v_rules -> 'brand_ids' ? v_product.tenant_brand_id::text) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'category_ids' AND jsonb_array_length(v_rules -> 'category_ids') > 0 THEN
      IF NOT (v_rules -> 'category_ids' ? v_product.tenant_category_id::text) THEN
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
$function$;

CREATE OR REPLACE FUNCTION app.evaluate_product_for_campaigns_v2(p_tenant_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_product record;
  v_inventory record;
  v_rules jsonb;
  v_matches boolean;
  v_stock_status text;
  v_sold boolean := false;
  v_campaign record;
  v_now timestamptz := now();
  v_qty_available_total numeric;
  v_effective_threshold numeric;
  v_invoice_value numeric;
  v_prev_invoice_value numeric;
  v_estimate_value numeric;
  v_order_value numeric;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
BEGIN
  SELECT tp.id, tp.tenant_id, tp.tenant_brand_id, tp.tenant_category_id, tp.is_active,
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

  SELECT COALESCE(SUM(qty_available), 0), COALESCE(NULLIF(SUM(reorder_point), 0), 10)
  INTO v_qty_available_total, v_effective_threshold
  FROM app.tenant_inventory
  WHERE tenant_product_id = p_tenant_product_id AND deleted_at IS NULL;
  v_qty_available_total := COALESCE(v_qty_available_total, 0);
  v_effective_threshold := COALESCE(v_effective_threshold, 10);

  SELECT COALESCE(invoice_value, 0), COALESCE(estimate_value, 0), COALESCE(order_value, 0)
  INTO v_invoice_value, v_estimate_value, v_order_value
  FROM app.metrics_product_period_summary
  WHERE tenant_id = v_product.tenant_id AND tenant_product_id = p_tenant_product_id
    AND grain = 'quarter' AND period_start = v_quarter_start AND deleted_at IS NULL;
  v_invoice_value := COALESCE(v_invoice_value, 0);
  v_estimate_value := COALESCE(v_estimate_value, 0);
  v_order_value := COALESCE(v_order_value, 0);

  SELECT COALESCE(invoice_value, 0) INTO v_prev_invoice_value
  FROM app.metrics_product_period_summary
  WHERE tenant_id = v_product.tenant_id AND tenant_product_id = p_tenant_product_id
    AND grain = 'quarter' AND period_start = v_prev_quarter_start AND deleted_at IS NULL;
  v_prev_invoice_value := COALESCE(v_prev_invoice_value, 0);

  FOR v_campaign IN
    SELECT id, dynamic_rules
    FROM app.campaigns
    WHERE tenant_id = v_product.tenant_id
      AND product_membership_mode = 'automatic'
      AND deleted_at IS NULL
  LOOP
    v_rules := app.membership_normalize_product_rules(v_campaign.dynamic_rules);

    IF v_rules -> 'quick_filters' ? 'top20' THEN
      PERFORM app.membership_mark_dirty(v_product.tenant_id, 'campaign_products', v_campaign.id, 'top20_defer_to_refresh');
      CONTINUE;
    END IF;

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

    IF v_matches AND v_rules ? 'quick_filters' AND jsonb_array_length(v_rules -> 'quick_filters') > 0 THEN
      IF NOT (
        (v_rules -> 'quick_filters' ? 'selling_oos' AND v_invoice_value > 0 AND v_qty_available_total = 0)
        OR (v_rules -> 'quick_filters' ? 'selling_low_stock' AND v_invoice_value > 0 AND v_qty_available_total < v_effective_threshold)
        OR (v_rules -> 'quick_filters' ? 'selling_qtr' AND v_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'not_selling_qtr' AND v_invoice_value = 0 AND v_prev_invoice_value > 0)
        OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (v_estimate_value > 0 OR v_order_value > 0) AND v_invoice_value = 0)
      ) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'stock' THEN
      IF (v_rules ->> 'stock' = 'in_stock' AND NOT (v_qty_available_total >= v_effective_threshold))
        OR (v_rules ->> 'stock' = 'low_stock' AND NOT (v_qty_available_total > 0 AND v_qty_available_total < v_effective_threshold))
        OR (v_rules ->> 'stock' = 'out_of_stock' AND NOT (v_qty_available_total = 0)) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'status' THEN
      IF (v_rules ->> 'status' = 'active' AND NOT (v_invoice_value > 0))
        OR (v_rules ->> 'status' = 'dormant' AND NOT (v_invoice_value = 0 AND v_prev_invoice_value > 0))
        OR (v_rules ->> 'status' = 'inactive' AND COALESCE(v_product.is_active, true)) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'brand_ids' AND jsonb_array_length(v_rules -> 'brand_ids') > 0 THEN
      IF NOT (v_rules -> 'brand_ids' ? v_product.tenant_brand_id::text) THEN
        v_matches := false;
      END IF;
    END IF;

    IF v_matches AND v_rules ? 'category_ids' AND jsonb_array_length(v_rules -> 'category_ids') > 0 THEN
      IF NOT (v_rules -> 'category_ids' ? v_product.tenant_category_id::text) THEN
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
$function$;

-- =============================================================================================
-- 4. Whole-set refresh functions -- extended predicate branches, INCLUDING top20 (correctly
--    computable here via percent_rank() over the entity's own already-rule-filtered candidate
--    set) and the status='inactive' base-eligibility flip (for buyers, mirroring
--    search_cohort_composer_buyers -- see header note on why the realtime evaluators above
--    cannot support it).
-- =============================================================================================

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
  v_want_inactive boolean;
  v_want_top20 boolean;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
BEGIN
  SELECT tenant_id, app.membership_normalize_buyer_rules(rules)
  INTO v_tenant_id, v_rules
  FROM app.cohorts
  WHERE id = p_cohort_id AND membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_want_inactive := COALESCE(v_rules ->> 'status' = 'inactive', false);
  v_want_top20 := COALESCE(v_rules -> 'quick_filters' ? 'top20', false);

  WITH scoped AS (
    SELECT
      b.id AS buyer_id,
      b.buyer_app_enabled,
      COALESCE(now_s.receivable_amount, 0) AS receivable_amount,
      COALESCE(now_s.overdue_amount, 0) AS overdue_amount,
      COALESCE(period_s.invoice_value, 0) AS invoice_value,
      COALESCE(period_prev_s.invoice_value, 0) AS prev_invoice_value,
      COALESCE(period_s.estimate_value, 0) AS estimate_value,
      COALESCE(period_s.order_value, 0) AS order_value,
      app.derive_buyer_app_status(b.is_active, b.buyer_app_enabled) AS buyer_app_status,
      app.membership_buyer_has_invoice_this_quarter(v_tenant_id, b.id, v_now) AS has_invoice,
      app.membership_buyer_has_demand_this_quarter(v_tenant_id, b.id, v_now) AS has_demand
    FROM app.buyers b
    LEFT JOIN app.metrics_buyer_now_summary now_s
      ON now_s.tenant_id = v_tenant_id AND now_s.buyer_id = b.id AND now_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_s
      ON period_s.tenant_id = v_tenant_id AND period_s.buyer_id = b.id
     AND period_s.grain = 'quarter' AND period_s.period_start = v_quarter_start AND period_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_prev_s
      ON period_prev_s.tenant_id = v_tenant_id AND period_prev_s.buyer_id = b.id
     AND period_prev_s.grain = 'quarter' AND period_prev_s.period_start = v_prev_quarter_start AND period_prev_s.deleted_at IS NULL
    WHERE b.tenant_id = v_tenant_id
      AND b.deleted_at IS NULL
      AND ((NOT v_want_inactive AND COALESCE(b.is_active, true)) OR (v_want_inactive AND b.is_active = false))
  ),
  matched_pre AS (
    SELECT *
    FROM scoped s
    WHERE (NOT (v_rules ? 'buyer_app_status')
           OR s.buyer_app_status = v_rules ->> 'buyer_app_status')
      AND (NOT (v_rules ? 'invoice_status_this_quarter')
           OR (v_rules ->> 'invoice_status_this_quarter' = 'purchased') = s.has_invoice)
      AND (NOT (v_rules ? 'demand_status_this_quarter')
           OR (v_rules ->> 'demand_status_this_quarter' = 'has_demand') = s.has_demand)
      AND (
        NOT (v_rules ? 'quick_filters') OR jsonb_array_length(v_rules -> 'quick_filters') = 0
        OR (
          (v_rules -> 'quick_filters' ? 'has_dues' AND s.receivable_amount > 0)
          OR (v_rules -> 'quick_filters' ? 'overdue' AND s.overdue_amount > 0)
          OR (v_rules -> 'quick_filters' ? 'app_enabled' AND s.buyer_app_enabled = true)
          OR (v_rules -> 'quick_filters' ? 'dormant_qtr' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
          OR (v_rules -> 'quick_filters' ? 'buying_qtr' AND s.invoice_value > 0)
          OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (s.estimate_value > 0 OR s.order_value > 0) AND s.invoice_value = 0)
          OR (v_rules -> 'quick_filters' ? 'top20' AND s.invoice_value > 0)
        )
      )
      AND (NOT (v_rules ? 'status')
        OR (v_rules ->> 'status' = 'active' AND s.invoice_value > 0)
        OR (v_rules ->> 'status' = 'dormant' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
        OR (v_rules ->> 'status' = 'inactive'))
      AND (NOT (v_rules ? 'buyer_app')
        OR (v_rules ->> 'buyer_app' = 'enabled' AND s.buyer_app_enabled = true)
        OR (v_rules ->> 'buyer_app' = 'not_enabled' AND s.buyer_app_enabled = false))
      AND (NOT (v_rules ? 'outstanding')
        OR (v_rules ->> 'outstanding' = 'has_dues' AND s.receivable_amount > 0)
        OR (v_rules ->> 'outstanding' = 'overdue' AND s.overdue_amount > 0))
      AND (NOT (v_rules ? 'sales_location_id') OR EXISTS (
        SELECT 1 FROM app.invoices i
        WHERE i.tenant_id = v_tenant_id AND i.buyer_id = s.buyer_id
          AND i.location_id = (v_rules ->> 'sales_location_id')::uuid
          AND i.invoice_date >= v_quarter_start AND i.deleted_at IS NULL
      ))
  ),
  gmv_rank AS (
    SELECT buyer_id, percent_rank() OVER (ORDER BY invoice_value DESC) AS pct_rank
    FROM matched_pre WHERE invoice_value > 0
  ),
  matched AS (
    SELECT mp.buyer_id
    FROM matched_pre mp
    LEFT JOIN gmv_rank gr ON gr.buyer_id = mp.buyer_id
    WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
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
  v_want_inactive boolean;
  v_want_top20 boolean;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
BEGIN
  SELECT tenant_id, app.membership_normalize_buyer_rules(buyer_filter_rules)
  INTO v_tenant_id, v_rules
  FROM app.campaigns
  WHERE id = p_campaign_id AND buyer_target_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_want_inactive := COALESCE(v_rules ->> 'status' = 'inactive', false);
  v_want_top20 := COALESCE(v_rules -> 'quick_filters' ? 'top20', false);

  WITH scoped AS (
    SELECT
      b.id AS buyer_id,
      b.buyer_app_enabled,
      COALESCE(now_s.receivable_amount, 0) AS receivable_amount,
      COALESCE(now_s.overdue_amount, 0) AS overdue_amount,
      COALESCE(period_s.invoice_value, 0) AS invoice_value,
      COALESCE(period_prev_s.invoice_value, 0) AS prev_invoice_value,
      COALESCE(period_s.estimate_value, 0) AS estimate_value,
      COALESCE(period_s.order_value, 0) AS order_value,
      app.derive_buyer_app_status(b.is_active, b.buyer_app_enabled) AS buyer_app_status,
      app.membership_buyer_has_invoice_this_quarter(v_tenant_id, b.id, v_now) AS has_invoice,
      app.membership_buyer_has_demand_this_quarter(v_tenant_id, b.id, v_now) AS has_demand
    FROM app.buyers b
    LEFT JOIN app.metrics_buyer_now_summary now_s
      ON now_s.tenant_id = v_tenant_id AND now_s.buyer_id = b.id AND now_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_s
      ON period_s.tenant_id = v_tenant_id AND period_s.buyer_id = b.id
     AND period_s.grain = 'quarter' AND period_s.period_start = v_quarter_start AND period_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_prev_s
      ON period_prev_s.tenant_id = v_tenant_id AND period_prev_s.buyer_id = b.id
     AND period_prev_s.grain = 'quarter' AND period_prev_s.period_start = v_prev_quarter_start AND period_prev_s.deleted_at IS NULL
    WHERE b.tenant_id = v_tenant_id
      AND b.deleted_at IS NULL
      AND ((NOT v_want_inactive AND COALESCE(b.is_active, true)) OR (v_want_inactive AND b.is_active = false))
  ),
  matched_pre AS (
    SELECT *
    FROM scoped s
    WHERE (NOT (v_rules ? 'buyer_app_status')
           OR s.buyer_app_status = v_rules ->> 'buyer_app_status')
      AND (NOT (v_rules ? 'invoice_status_this_quarter')
           OR (v_rules ->> 'invoice_status_this_quarter' = 'purchased') = s.has_invoice)
      AND (NOT (v_rules ? 'demand_status_this_quarter')
           OR (v_rules ->> 'demand_status_this_quarter' = 'has_demand') = s.has_demand)
      AND (
        NOT (v_rules ? 'quick_filters') OR jsonb_array_length(v_rules -> 'quick_filters') = 0
        OR (
          (v_rules -> 'quick_filters' ? 'has_dues' AND s.receivable_amount > 0)
          OR (v_rules -> 'quick_filters' ? 'overdue' AND s.overdue_amount > 0)
          OR (v_rules -> 'quick_filters' ? 'app_enabled' AND s.buyer_app_enabled = true)
          OR (v_rules -> 'quick_filters' ? 'dormant_qtr' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
          OR (v_rules -> 'quick_filters' ? 'buying_qtr' AND s.invoice_value > 0)
          OR (v_rules -> 'quick_filters' ? 'enquire_no_sales' AND (s.estimate_value > 0 OR s.order_value > 0) AND s.invoice_value = 0)
          OR (v_rules -> 'quick_filters' ? 'top20' AND s.invoice_value > 0)
        )
      )
      AND (NOT (v_rules ? 'status')
        OR (v_rules ->> 'status' = 'active' AND s.invoice_value > 0)
        OR (v_rules ->> 'status' = 'dormant' AND s.invoice_value = 0 AND s.prev_invoice_value > 0)
        OR (v_rules ->> 'status' = 'inactive'))
      AND (NOT (v_rules ? 'buyer_app')
        OR (v_rules ->> 'buyer_app' = 'enabled' AND s.buyer_app_enabled = true)
        OR (v_rules ->> 'buyer_app' = 'not_enabled' AND s.buyer_app_enabled = false))
      AND (NOT (v_rules ? 'outstanding')
        OR (v_rules ->> 'outstanding' = 'has_dues' AND s.receivable_amount > 0)
        OR (v_rules ->> 'outstanding' = 'overdue' AND s.overdue_amount > 0))
      AND (NOT (v_rules ? 'sales_location_id') OR EXISTS (
        SELECT 1 FROM app.invoices i
        WHERE i.tenant_id = v_tenant_id AND i.buyer_id = s.buyer_id
          AND i.location_id = (v_rules ->> 'sales_location_id')::uuid
          AND i.invoice_date >= v_quarter_start AND i.deleted_at IS NULL
      ))
  ),
  gmv_rank AS (
    SELECT buyer_id, percent_rank() OVER (ORDER BY invoice_value DESC) AS pct_rank
    FROM matched_pre WHERE invoice_value > 0
  ),
  matched AS (
    SELECT mp.buyer_id
    FROM matched_pre mp
    LEFT JOIN gmv_rank gr ON gr.buyer_id = mp.buyer_id
    WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
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
  v_want_inactive boolean;
  v_want_top20 boolean;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
BEGIN
  SELECT tenant_id, app.membership_normalize_product_rules(dynamic_rules)
  INTO v_tenant_id, v_rules
  FROM app.campaigns
  WHERE id = p_campaign_id AND product_membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

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
  v_want_inactive boolean;
  v_want_top20 boolean;
  v_quarter_start date := date_trunc('quarter', v_now)::date;
  v_prev_quarter_start date := (date_trunc('quarter', v_now) - interval '3 months')::date;
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
      tp.base_selling_price,
      tp.mrp,
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
    SELECT mp.tenant_product_id, mp.base_selling_price, mp.mrp
    FROM matched_pre mp
    LEFT JOIN gmv_rank gr ON gr.tenant_product_id = mp.tenant_product_id
    WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
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
