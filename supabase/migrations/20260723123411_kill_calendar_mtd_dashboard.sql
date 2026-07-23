-- Kills calendar-MTD from the seller Dashboard's own RPC, per
-- specs/kpi-callout-audit-2026-07-23.md §3 "Dashboard" and §6 rule 1
-- (P1 item 7 in specs/kpi-fix-execution-log.md).
--
-- Scope: app.get_metrics_v2_seller_dashboard only — NOT
-- app.metrics_v2_transaction_landing (Invoices/Orders/Estimates landing),
-- which is out of scope for this migration (handled separately).
--
-- Root cause: two spots in this RPC computed a true calendar-month-to-date
-- window instead of the app-wide trailing-90-day standard:
--   1. The 'invoiced_sales' KPI metric (feeds the Dashboard admin KPI strip's
--      "Invoiced sales" tile) — tenant-wide branch read
--      metrics_tenant_commercial_snapshot.current_month_invoice_value (true
--      calendar MTD); location-scoped branch summed
--      metrics_location_daily.invoice_value for day BETWEEN month_start AND
--      today (true calendar MTD).
--   2. The 'business_flow' explore card's three tiles (Invoiced sales / Order
--      value / Estimate value) — all read metrics_tenant_commercial_snapshot's
--      current_month_* columns (true calendar MTD), tenant-wide regardless of
--      location scope (pre-existing scope behavior, preserved as-is here —
--      only the window changes).
--
-- Fix: both spots now compute trailing-90-days, matching the idiom this same
-- function already uses for its OTHER 90d metrics in this function body
-- (`v_horizon_start := (now() AT TIME ZONE 'Asia/Kolkata')::date - 89`,
-- already declared and already used for buyer-app / sales-mix / customer-
-- activity metrics a few lines below). The tenant-wide branch's MTD snapshot
-- read is replaced with a live trailing-90d SUM over app.metrics_tenant_daily
-- (the same per-day tenant-wide rollup table already used elsewhere in this
-- function for app_contribution_over_time) — there is no pre-aggregated 90d
-- snapshot column for order/estimate/invoice value+count on
-- metrics_tenant_commercial_snapshot to read instead. The location-scoped
-- branch's invoice-value sum keeps reading metrics_location_daily, just with
-- its window widened from month_start..today to horizon_start..today.
--
-- v_month_start is no longer used anywhere in this function and is removed.
--
-- Full function body copied from 20260716090456_metrics_v2_phase_5_dashboard_metrics_foundation.sql
-- (the current source of truth, confirmed via repo-wide grep to be the only
-- CREATE OR REPLACE of this function) with only the MTD window computations
-- changed as described above.
CREATE OR REPLACE FUNCTION app.get_metrics_v2_seller_dashboard(
  p_tenant_id uuid,
  p_role text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_as_of timestamptz := COALESCE(p_as_of, now());
  v_today date := (COALESCE(p_as_of, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  v_horizon_start date := ((COALESCE(p_as_of, now()) AT TIME ZONE 'Asia/Kolkata')::date - 89);
  v_scope_location_ids uuid[] := CASE
    WHEN p_location_ids IS NULL OR array_length(p_location_ids, 1) IS NULL THEN NULL
    ELSE p_location_ids
  END;
  v_primary text := app.metrics_v2_primary_demand_kind(p_tenant_id);
  v_commercial app.metrics_tenant_commercial_snapshot%ROWTYPE;
  v_inventory app.metrics_tenant_inventory_snapshot%ROWTYPE;
  v_buyer_app app.metrics_tenant_buyer_app_snapshot%ROWTYPE;
  v_setup app.metrics_tenant_setup_snapshot%ROWTYPE;
  v_invoiced_sales numeric := 0;
  v_invoiced_sales_count bigint := 0;
  v_order_value_90d numeric := 0;
  v_order_count_90d bigint := 0;
  v_estimate_value_90d numeric := 0;
  v_estimate_count_90d bigint := 0;
  v_open_order_value numeric := 0;
  v_open_primary_value numeric := 0;
  v_open_primary_count bigint := 0;
  v_overdue_amount numeric := 0;
  v_overdue_count bigint := 0;
  v_due_7_amount numeric := 0;
  v_due_7_count bigint := 0;
  v_purchasing_customers bigint := 0;
  v_recent_out_stock bigint := 0;
  v_stock_no_sale bigint := 0;
  v_buyer_app_demand_customers bigint := 0;
  v_buyer_app_sales_share numeric := 0;
  v_business_flow jsonb := '{}'::jsonb;
  v_sales_mix jsonb := '{}'::jsonb;
  v_customer_activity jsonb := '{}'::jsonb;
  v_inventory_actions jsonb := '{}'::jsonb;
  v_buyer_app_teaser jsonb := '{}'::jsonb;
  v_significant_changes jsonb := '{}'::jsonb;
  v_location_comparison jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_freshness jsonb;
BEGIN
  SELECT * INTO v_commercial
  FROM app.metrics_tenant_commercial_snapshot
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT * INTO v_inventory
  FROM app.metrics_tenant_inventory_snapshot
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT * INTO v_buyer_app
  FROM app.metrics_tenant_buyer_app_snapshot
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT * INTO v_setup
  FROM app.metrics_tenant_setup_snapshot
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  -- Tenant-wide, trailing-90d "Business flow" figures (order/estimate value +
  -- count) are always read tenant-wide regardless of location scope — this
  -- matches the pre-existing scope behavior of this card (it never scoped to
  -- p_location_ids even under the old calendar-MTD read); only the window
  -- moved from calendar-month to trailing-90d.
  SELECT
    COALESCE(SUM(d.order_value), 0),
    COALESCE(SUM(d.order_count), 0)::bigint,
    COALESCE(SUM(d.estimate_value), 0),
    COALESCE(SUM(d.estimate_count), 0)::bigint
  INTO v_order_value_90d, v_order_count_90d, v_estimate_value_90d, v_estimate_count_90d
  FROM app.metrics_tenant_daily d
  WHERE d.tenant_id = p_tenant_id
    AND d.deleted_at IS NULL
    AND d.day >= v_horizon_start
    AND d.day <= v_today;

  IF v_scope_location_ids IS NULL THEN
    SELECT
      COALESCE(SUM(d.invoice_value), 0),
      COALESCE(SUM(d.invoice_count), 0)::bigint
    INTO v_invoiced_sales, v_invoiced_sales_count
    FROM app.metrics_tenant_daily d
    WHERE d.tenant_id = p_tenant_id
      AND d.deleted_at IS NULL
      AND d.day >= v_horizon_start
      AND d.day <= v_today;

    v_open_order_value := COALESCE(v_commercial.open_order_value, 0);
    v_open_primary_value := CASE v_primary
      WHEN 'orders' THEN COALESCE(v_commercial.open_order_value, 0)
      WHEN 'estimates' THEN COALESCE(v_commercial.open_estimate_value, 0)
      ELSE NULL
    END;
    v_open_primary_count := CASE v_primary
      WHEN 'orders' THEN COALESCE(v_commercial.open_order_count, 0)
      WHEN 'estimates' THEN COALESCE(v_commercial.open_estimate_count, 0)
      ELSE NULL
    END;
    v_overdue_amount := COALESCE(v_commercial.overdue_amount, 0);
    v_overdue_count := COALESCE(v_commercial.overdue_invoice_count, 0);
    v_purchasing_customers := COALESCE(v_commercial.purchasing_buyers_90d, 0);
  ELSE
    SELECT
      COALESCE(SUM(ld.invoice_value) FILTER (WHERE ld.day >= v_horizon_start AND ld.day <= v_today), 0),
      COALESCE(SUM(ld.invoice_count) FILTER (WHERE ld.day >= v_horizon_start AND ld.day <= v_today), 0)::bigint,
      COALESCE(SUM(ls.open_order_value), 0),
      CASE v_primary
        WHEN 'orders' THEN COALESCE(SUM(ls.open_order_value), 0)
        WHEN 'estimates' THEN COALESCE(SUM(ls.open_estimate_value), 0)
        ELSE NULL
      END,
      CASE v_primary
        WHEN 'orders' THEN COALESCE(SUM(ls.open_order_count), 0)::bigint
        WHEN 'estimates' THEN COALESCE(SUM(ls.open_estimate_count), 0)::bigint
        ELSE NULL
      END,
      COALESCE(SUM(ls.overdue_amount), 0),
      COUNT(*) FILTER (WHERE ls.overdue_amount > 0),
      COALESCE(SUM(ls.purchasing_buyers_90d), 0)::bigint
    INTO
      v_invoiced_sales, v_invoiced_sales_count, v_open_order_value, v_open_primary_value, v_open_primary_count,
      v_overdue_amount, v_overdue_count, v_purchasing_customers
    FROM app.metrics_location_snapshot ls
    LEFT JOIN app.metrics_location_daily ld
      ON ld.tenant_id = ls.tenant_id
     AND ld.location_id = ls.location_id
     AND ld.deleted_at IS NULL
     AND ld.day >= v_horizon_start
     AND ld.day <= v_today
    WHERE ls.tenant_id = p_tenant_id
      AND ls.deleted_at IS NULL
      AND ls.location_id = ANY(v_scope_location_ids);
  END IF;

  SELECT
    COALESCE(SUM(i.outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
        AND i.due_date >= v_today
        AND i.due_date <= v_today + 7
    ), 0),
    COUNT(*) FILTER (
      WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
        AND i.due_date >= v_today
        AND i.due_date <= v_today + 7
    )
  INTO v_due_7_amount, v_due_7_count
  FROM app.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.deleted_at IS NULL
    AND (v_scope_location_ids IS NULL OR i.location_id = ANY(v_scope_location_ids));

  SELECT
    COUNT(*) FILTER (WHERE ps.out_of_stock AND ps.invoice_units_90d > 0),
    COUNT(*) FILTER (WHERE ps.available > 0 AND COALESCE(ps.invoice_units_90d, 0) = 0)
  INTO v_recent_out_stock, v_stock_no_sale
  FROM app.metrics_product_snapshot ps
  WHERE ps.tenant_id = p_tenant_id
    AND ps.deleted_at IS NULL;

  IF v_primary = 'orders' THEN
    SELECT COUNT(DISTINCT o.buyer_id)
    INTO v_buyer_app_demand_customers
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.is_buyer_app_order
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) >= v_horizon_start
      AND (v_scope_location_ids IS NULL OR o.location_id = ANY(v_scope_location_ids));
  ELSIF v_primary = 'estimates' THEN
    SELECT COUNT(DISTINCT e.buyer_id)
    INTO v_buyer_app_demand_customers
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.is_buyer_app_estimate
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_horizon_start
      AND (v_scope_location_ids IS NULL OR e.location_id = ANY(v_scope_location_ids));
  END IF;

  v_buyer_app_sales_share := CASE
    WHEN v_invoiced_sales > 0
    THEN ROUND((COALESCE(v_buyer_app.app_invoice_value_90d, 0) / NULLIF(v_invoiced_sales, 0)) * 100, 2)
    ELSE 0
  END;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY value_num DESC), '[]'::jsonb)
  INTO v_location_comparison
  FROM (
    SELECT jsonb_build_object(
      'location_id', l.id,
      'name', l.name,
      'invoiced_sales_90d', COALESCE(ls.invoice_value_90d, 0),
      'open_primary_demand_value', CASE v_primary
        WHEN 'orders' THEN COALESCE(ls.open_order_value, 0)
        WHEN 'estimates' THEN COALESCE(ls.open_estimate_value, 0)
        ELSE NULL
      END,
      'overdue_amount', COALESCE(ls.overdue_amount, 0)
    ) AS row_json,
    COALESCE(ls.invoice_value_90d, 0) AS value_num
    FROM app.locations l
    LEFT JOIN app.metrics_location_snapshot ls
      ON ls.tenant_id = l.tenant_id
     AND ls.location_id = l.id
     AND ls.deleted_at IS NULL
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND l.status = 'active'
      AND (v_scope_location_ids IS NULL OR l.id = ANY(v_scope_location_ids))
    ORDER BY COALESCE(ls.invoice_value_90d, 0) DESC, l.name
    LIMIT 20
  ) ranked;

  SELECT jsonb_build_object(
    'primary_demand_kind', v_primary,
    'estimate_value_this_month', v_estimate_value_90d,
    'estimate_count_this_month', v_estimate_count_90d,
    'order_value_this_month', v_order_value_90d,
    'order_count_this_month', v_order_count_90d,
    'invoice_value_this_month', v_invoiced_sales,
    'invoice_count_this_month', v_invoiced_sales_count
  ) INTO v_business_flow;

  WITH invoice_lines AS (
    SELECT ii.tenant_product_id, COALESCE(ii.line_total, ii.qty * ii.unit_price, 0) AS value
    FROM app.invoice_items ii
    JOIN app.invoices i ON i.id = ii.invoice_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND ii.deleted_at IS NULL
      AND app.invoice_status_gmv_included(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_horizon_start
      AND (v_scope_location_ids IS NULL OR i.location_id = ANY(v_scope_location_ids))
  ), product_dims AS (
    SELECT il.value, tp.tenant_brand_id, tp.tenant_category_id
    FROM invoice_lines il
    JOIN app.tenant_products tp ON tp.id = il.tenant_product_id
  )
  SELECT jsonb_build_object(
    'brands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', tb.id, 'name', COALESCE(tb.display_name_override, 'Unknown brand'), 'value', x.value) ORDER BY x.value DESC)
      FROM (
        SELECT tenant_brand_id, SUM(value) AS value
        FROM product_dims
        WHERE tenant_brand_id IS NOT NULL
        GROUP BY tenant_brand_id
        ORDER BY SUM(value) DESC
        LIMIT 10
      ) x
      JOIN app.tenant_brands tb ON tb.id = x.tenant_brand_id
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', tc.id, 'name', tc.name, 'value', x.value) ORDER BY x.value DESC)
      FROM (
        SELECT tenant_category_id, SUM(value) AS value
        FROM product_dims
        WHERE tenant_category_id IS NOT NULL
        GROUP BY tenant_category_id
        ORDER BY SUM(value) DESC
        LIMIT 10
      ) x
      JOIN app.tenant_categories tc ON tc.id = x.tenant_category_id
    ), '[]'::jsonb),
    'locations', v_location_comparison
  ) INTO v_sales_mix;

  SELECT jsonb_build_object(
    'purchasing_customers_90d', v_purchasing_customers,
    'repeat_customers_90d', COUNT(*) FILTER (WHERE bs.invoice_count_90d >= 2),
    'inactive_customers_90d', COUNT(*) FILTER (WHERE bs.last_invoice_at IS NULL OR bs.last_invoice_at < (v_horizon_start::timestamp AT TIME ZONE 'Asia/Kolkata')),
    'overdue_customers_now', COUNT(*) FILTER (WHERE bs.overdue_amount > 0)
  )
  INTO v_customer_activity
  FROM app.metrics_buyer_snapshot bs
  WHERE bs.tenant_id = p_tenant_id
    AND bs.deleted_at IS NULL;

  v_inventory_actions := jsonb_build_object(
    'recent_invoice_sellers_out_of_stock', v_recent_out_stock,
    'stock_with_no_sale_90d', v_stock_no_sale,
    'low_stock_product_count', COALESCE(v_inventory.low_stock_product_count, 0),
    'out_of_stock_product_count', COALESCE(v_inventory.out_of_stock_product_count, 0)
  );

  v_buyer_app_teaser := jsonb_build_object(
    'enabled_buyers', COALESCE(v_buyer_app.enabled_buyer_count, 0),
    'active_buyers_90d', COALESCE(v_buyer_app.active_buyer_count_90d, 0),
    'demand_customers_90d', COALESCE(v_buyer_app_demand_customers, 0),
    'app_sourced_invoiced_sales_90d', COALESCE(v_buyer_app.app_invoice_value_90d, 0),
    'app_sourced_invoice_share_pct', v_buyer_app_sales_share
  );

  v_significant_changes := jsonb_build_object(
    'available', false,
    'reason', 'Requires reviewed materiality thresholds for cancellations, newly overdue invoices, and integration/data warnings.'
  );

  SELECT jsonb_agg(action_item)
  INTO v_actions
  FROM (
    VALUES
      (app.metrics_v2_foundation_item('primary_demand_action', CASE v_primary WHEN 'estimates' THEN 'Estimate follow-up' WHEN 'orders' THEN 'Order execution' ELSE 'Primary demand action' END, 'NOW', 'REWORK', v_open_primary_value, v_open_primary_count, 'currency', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, jsonb_build_object('primary_demand_kind', v_primary))),
      (app.metrics_v2_foundation_item('estimate_follow_up', 'Estimate follow-up', 'NOW', 'READY', COALESCE(v_commercial.open_estimate_value, 0), COALESCE(v_commercial.open_estimate_count, 0), 'currency', true, NULL, '{}'::jsonb)),
      (app.metrics_v2_foundation_item('order_execution', 'Order execution', 'NOW', 'READY', COALESCE(v_commercial.open_order_value, 0), COALESCE(v_commercial.open_order_count, 0), 'currency', true, NULL, '{}'::jsonb)),
      (app.metrics_v2_foundation_item('collections', 'Collections', 'NOW', 'READY', v_overdue_amount, v_overdue_count, 'currency', true, NULL, '{}'::jsonb)),
      (app.metrics_v2_foundation_item('product_availability', 'Product availability', 'NOW + 90D', 'REWORK', NULL, v_recent_out_stock, 'count', true, NULL, v_inventory_actions)),
      (app.metrics_v2_foundation_item('customer_reactivation', 'Customer reactivation', 'NOW + 90D', 'CONDITIONAL', NULL, (v_customer_activity->>'inactive_customers_90d')::bigint, 'count', true, NULL, '{}'::jsonb)),
      (app.metrics_v2_foundation_item('buyer_app_activation', 'Buyer App activation', 'NOW + 90D', 'REWORK', COALESCE(v_buyer_app.assisted_invoice_value_90d, 0), NULL, 'currency', true, NULL, v_buyer_app_teaser))
  ) AS actions(action_item);

  v_freshness := jsonb_build_object(
    'commercial_source_watermark', v_commercial.source_watermark,
    'commercial_computed_at', v_commercial.computed_at,
    'inventory_source_watermark', v_inventory.source_watermark,
    'inventory_computed_at', v_inventory.computed_at,
    'buyer_app_source_watermark', v_buyer_app.source_watermark,
    'buyer_app_computed_at', v_buyer_app.computed_at,
    'setup_source_watermark', v_setup.source_watermark,
    'setup_computed_at', v_setup.computed_at
  );

  RETURN jsonb_build_object(
    'as_of', v_as_of,
    'commercial_horizon_days', 90,
    'table_period', NULL,
    'primary_demand_kind', v_primary,
    'calculation_version', 1,
    'source_watermark', GREATEST(v_commercial.source_watermark, v_inventory.source_watermark, v_buyer_app.source_watermark, v_setup.source_watermark),
    'freshness', v_freshness,
    'availability', jsonb_build_object(
      'primary_demand', jsonb_build_object('available', v_primary <> 'none', 'kind', v_primary),
      'significant_changes', v_significant_changes
    ),
    'metrics', jsonb_build_array(
      app.metrics_v2_foundation_item('invoiced_sales', 'Invoiced sales', '90D', 'REWORK', v_invoiced_sales, v_invoiced_sales_count, 'currency'),
      app.metrics_v2_foundation_item('open_order_value', 'Open order value', 'NOW', 'READY', v_open_order_value, COALESCE(v_commercial.open_order_count, 0), 'currency'),
      app.metrics_v2_foundation_item('overdue_receivables', 'Overdue receivables', 'NOW', 'READY', v_overdue_amount, v_overdue_count, 'currency'),
      app.metrics_v2_foundation_item('recently_sold_products_now_out_of_stock', 'Recently sold products now out of stock', 'NOW + 90D', 'REWORK', NULL, v_recent_out_stock, 'count'),
      app.metrics_v2_foundation_item('customers_who_purchased', 'Customers who purchased', '90D', 'REWORK', NULL, v_purchasing_customers, 'count'),
      app.metrics_v2_foundation_item('open_primary_demand_value', 'Open primary demand value', 'NOW', 'REWORK', v_open_primary_value, v_open_primary_count, 'currency', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, jsonb_build_object('primary_demand_kind', v_primary)),
      app.metrics_v2_foundation_item('amount_due_in_7_days', 'Amount due in 7 days', 'NOW', 'READY', v_due_7_amount, v_due_7_count, 'currency'),
      app.metrics_v2_foundation_item('stock_with_no_sale_90d', 'Stock with no sale in 90 days', 'NOW + 90D', 'REWORK', NULL, v_stock_no_sale, 'count'),
      app.metrics_v2_foundation_item('buyer_app_demand_customers_sales_share', 'Buyer App demand customers + sales share', '90D', 'REWORK', v_buyer_app_sales_share, v_buyer_app_demand_customers, 'percent', true, NULL, v_buyer_app_teaser)
    ),
    'actions', COALESCE(v_actions, '[]'::jsonb),
    'explore', jsonb_build_array(
      app.metrics_v2_foundation_item('business_flow', 'Business flow', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, v_business_flow),
      app.metrics_v2_foundation_item('sales_mix', 'Sales mix', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, v_sales_mix),
      app.metrics_v2_foundation_item('customer_activity', 'Customer activity', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, v_customer_activity),
      app.metrics_v2_foundation_item('inventory_actions', 'Inventory actions', 'NOW + 90D', 'REWORK', NULL, NULL, NULL, true, NULL, v_inventory_actions),
      app.metrics_v2_foundation_item('buyer_app_teaser', 'Buyer App teaser', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, v_buyer_app_teaser),
      app.metrics_v2_foundation_item('significant_changes', 'Significant changes', 'NOW', 'CONDITIONAL', NULL, NULL, NULL, false, 'Requires reviewed materiality thresholds.', v_significant_changes),
      app.metrics_v2_foundation_item('location_comparison', 'Location comparison', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, jsonb_build_object('locations', v_location_comparison))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION app.get_metrics_v2_seller_dashboard(uuid, text, uuid[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_metrics_v2_seller_dashboard(uuid, text, uuid[], timestamptz) TO authenticated, service_role;
