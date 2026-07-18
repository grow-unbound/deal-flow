-- Metrics V2 Phase 5: dashboard metrics foundation.
--
-- Read-side portfolio RPCs only. No persisted dashboard metric membership,
-- runtime selector, feature flag, Cron, Realtime publication, or high-cardinality
-- daily fact is introduced here.

CREATE OR REPLACE FUNCTION app.metrics_v2_primary_demand_kind(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT CASE
    WHEN COALESCE((ts.settings #>> '{orders,features,sales_orders}')::boolean, false) THEN 'orders'
    WHEN COALESCE((ts.settings #>> '{orders,features,enquiries}')::boolean, false) THEN 'estimates'
    ELSE 'none'
  END
  FROM app.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id
  UNION ALL
  SELECT 'none'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.metrics_v2_foundation_item(
  p_id text,
  p_label text,
  p_time_basis text,
  p_feasibility text,
  p_value numeric DEFAULT NULL,
  p_count bigint DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_available boolean DEFAULT true,
  p_unavailable_reason text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', p_id,
    'label', p_label,
    'time_basis', p_time_basis,
    'feasibility', p_feasibility,
    'available', p_available,
    'unavailable_reason', p_unavailable_reason,
    'value', p_value,
    'count', p_count,
    'unit', p_unit,
    'meta', COALESCE(p_meta, '{}'::jsonb)
  ));
$$;

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
  v_month_start date := date_trunc('month', COALESCE(p_as_of, now()) AT TIME ZONE 'Asia/Kolkata')::date;
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

  IF v_scope_location_ids IS NULL THEN
    v_invoiced_sales := COALESCE(v_commercial.current_month_invoice_value, 0);
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
      COALESCE(SUM(ld.invoice_value) FILTER (WHERE ld.day >= v_month_start AND ld.day <= v_today), 0),
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
      v_invoiced_sales, v_open_order_value, v_open_primary_value, v_open_primary_count,
      v_overdue_amount, v_overdue_count, v_purchasing_customers
    FROM app.metrics_location_snapshot ls
    LEFT JOIN app.metrics_location_daily ld
      ON ld.tenant_id = ls.tenant_id
     AND ld.location_id = ls.location_id
     AND ld.deleted_at IS NULL
     AND ld.day >= v_month_start
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
    WHEN COALESCE(v_commercial.current_month_invoice_value, 0) > 0
    THEN ROUND((COALESCE(v_buyer_app.app_invoice_value_90d, 0) / NULLIF(v_commercial.current_month_invoice_value, 0)) * 100, 2)
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
    'estimate_value_this_month', COALESCE(v_commercial.current_month_estimate_value, 0),
    'estimate_count_this_month', COALESCE(v_commercial.current_month_estimate_count, 0),
    'order_value_this_month', COALESCE(v_commercial.current_month_order_value, 0),
    'order_count_this_month', COALESCE(v_commercial.current_month_order_count, 0),
    'invoice_value_this_month', v_invoiced_sales,
    'invoice_count_this_month', COALESCE(v_commercial.current_month_invoice_count, 0)
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
      app.metrics_v2_foundation_item('invoiced_sales', 'Invoiced sales', 'THIS MONTH', 'REWORK', v_invoiced_sales, COALESCE(v_commercial.current_month_invoice_count, 0), 'currency'),
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
      app.metrics_v2_foundation_item('business_flow', 'Business flow', 'THIS MONTH', 'REWORK', NULL, NULL, NULL, true, NULL, v_business_flow),
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

CREATE OR REPLACE FUNCTION app.get_metrics_v2_buyer_app_dashboard(
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
  v_12m_start date := ((COALESCE(p_as_of, now()) AT TIME ZONE 'Asia/Kolkata')::date - 364);
  v_scope_location_ids uuid[] := CASE
    WHEN p_location_ids IS NULL OR array_length(p_location_ids, 1) IS NULL THEN NULL
    ELSE p_location_ids
  END;
  v_primary text := app.metrics_v2_primary_demand_kind(p_tenant_id);
  v_buyer_app app.metrics_tenant_buyer_app_snapshot%ROWTYPE;
  v_setup app.metrics_tenant_setup_snapshot%ROWTYPE;
  v_commercial app.metrics_tenant_commercial_snapshot%ROWTYPE;
  v_enabled_buyers bigint := 0;
  v_total_buyers bigint := 0;
  v_used_buyers bigint := 0;
  v_demand_customers bigint := 0;
  v_repeat_customers bigint := 0;
  v_app_demand_value numeric := 0;
  v_total_demand_value numeric := 0;
  v_app_invoiced_value numeric := 0;
  v_total_invoiced_value numeric := 0;
  v_cancelled_count bigint := 0;
  v_demand_count bigint := 0;
  v_assisted_without_access jsonb := '[]'::jsonb;
  v_enabled_never_used jsonb := '[]'::jsonb;
  v_used_no_demand jsonb := '[]'::jsonb;
  v_inactive_after_demand jsonb := '[]'::jsonb;
  v_operational_action jsonb := '[]'::jsonb;
  v_business_through_app jsonb := '{}'::jsonb;
  v_contribution_over_time jsonb := '[]'::jsonb;
  v_adoption_by_location jsonb := '[]'::jsonb;
  v_adoption_by_group jsonb := '[]'::jsonb;
  v_assisted_quality jsonb := '{}'::jsonb;
  v_moving_to_app jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_buyer_app
  FROM app.metrics_tenant_buyer_app_snapshot
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT * INTO v_setup
  FROM app.metrics_tenant_setup_snapshot
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT * INTO v_commercial
  FROM app.metrics_tenant_commercial_snapshot
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE b.buyer_app_enabled)
  INTO v_total_buyers, v_enabled_buyers
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.is_active;

  SELECT COUNT(DISTINCT a.buyer_id)
  INTO v_used_buyers
  FROM app.buyer_app_activity a
  WHERE a.tenant_id = p_tenant_id
    AND a.deleted_at IS NULL
    AND a.qualifies_for_engagement
    AND a.occurred_day >= v_horizon_start
    AND (v_scope_location_ids IS NULL OR a.location_id = ANY(v_scope_location_ids));

  IF v_primary = 'orders' THEN
    SELECT
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)),
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status) AND x.doc_count >= 2),
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)), 0),
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0),
      COUNT(*) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)),
      COUNT(*) FILTER (WHERE o.is_buyer_app_order AND o.status = ANY (ARRAY['cancelled','rejected','archived']))
    INTO v_demand_customers, v_repeat_customers, v_app_demand_value, v_total_demand_value, v_demand_count, v_cancelled_count
    FROM app.orders o
    LEFT JOIN (
      SELECT buyer_id, COUNT(*) AS doc_count
      FROM app.orders
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL
        AND is_buyer_app_order
        AND app.order_status_in_flow(status)
        AND app.metric_day_ist(order_date, created_at) >= v_horizon_start
      GROUP BY buyer_id
    ) x ON x.buyer_id = o.buyer_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= v_horizon_start
      AND (v_scope_location_ids IS NULL OR o.location_id = ANY(v_scope_location_ids));
  ELSIF v_primary = 'estimates' THEN
    SELECT
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.is_buyer_app_estimate),
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.is_buyer_app_estimate AND x.doc_count >= 2),
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate), 0),
      COALESCE(SUM(e.total_amount), 0),
      COUNT(*) FILTER (WHERE e.is_buyer_app_estimate),
      0
    INTO v_demand_customers, v_repeat_customers, v_app_demand_value, v_total_demand_value, v_demand_count, v_cancelled_count
    FROM app.estimates e
    LEFT JOIN (
      SELECT buyer_id, COUNT(*) AS doc_count
      FROM app.estimates
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL
        AND is_buyer_app_estimate
        AND app.metric_day_ist(estimate_date, created_at) >= v_horizon_start
      GROUP BY buyer_id
    ) x ON x.buyer_id = e.buyer_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_horizon_start
      AND (v_scope_location_ids IS NULL OR e.location_id = ANY(v_scope_location_ids));
  END IF;

  SELECT
    COALESCE(SUM(i.total_amount) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)), 0),
    COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)
  INTO v_app_invoiced_value, v_total_invoiced_value
  FROM app.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.deleted_at IS NULL
    AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_horizon_start
    AND (v_scope_location_ids IS NULL OR i.location_id = ANY(v_scope_location_ids));

  WITH assisted AS (
    SELECT bs.buyer_id, b.business_name, bs.invoice_value_90d
    FROM app.metrics_buyer_snapshot bs
    JOIN app.buyers b ON b.id = bs.buyer_id
    WHERE bs.tenant_id = p_tenant_id
      AND bs.deleted_at IS NULL
      AND NOT bs.buyer_app_enabled
      AND bs.invoice_value_90d > 0
    ORDER BY bs.invoice_value_90d DESC, b.business_name
    LIMIT 3
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('buyer_id', buyer_id, 'name', business_name, 'invoice_value_90d', invoice_value_90d)), '[]'::jsonb)
  INTO v_assisted_without_access
  FROM assisted;

  WITH used AS (
    SELECT DISTINCT a.buyer_id
    FROM app.buyer_app_activity a
    WHERE a.tenant_id = p_tenant_id
      AND a.deleted_at IS NULL
      AND a.qualifies_for_engagement
      AND a.occurred_day >= v_horizon_start
  ), demand AS (
    SELECT DISTINCT buyer_id
    FROM app.orders
    WHERE v_primary = 'orders' AND tenant_id = p_tenant_id AND deleted_at IS NULL AND is_buyer_app_order
      AND app.metric_day_ist(order_date, created_at) >= v_horizon_start
    UNION
    SELECT DISTINCT buyer_id
    FROM app.estimates
    WHERE v_primary = 'estimates' AND tenant_id = p_tenant_id AND deleted_at IS NULL AND is_buyer_app_estimate
      AND app.metric_day_ist(estimate_date, created_at) >= v_horizon_start
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('buyer_id', ranked.id, 'name', ranked.business_name) ORDER BY ranked.business_name)
      FROM (
        SELECT b.id, b.business_name
        FROM app.buyers b
        LEFT JOIN used u ON u.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active AND b.buyer_app_enabled AND u.buyer_id IS NULL
        ORDER BY b.business_name
        LIMIT 3
      ) ranked), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('buyer_id', ranked.id, 'name', ranked.business_name) ORDER BY ranked.business_name)
      FROM (
        SELECT b.id, b.business_name
        FROM app.buyers b
        JOIN used u ON u.buyer_id = b.id
        LEFT JOIN demand d ON d.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND d.buyer_id IS NULL
        ORDER BY b.business_name
        LIMIT 3
      ) ranked), '[]'::jsonb)
  INTO v_enabled_never_used, v_used_no_demand;

  WITH app_demand AS (
    SELECT buyer_id, MAX(app.metric_day_ist(order_date, created_at)) AS last_day, SUM(total_amount) AS value
    FROM app.orders
    WHERE v_primary = 'orders' AND tenant_id = p_tenant_id AND deleted_at IS NULL AND is_buyer_app_order
    GROUP BY buyer_id
    UNION ALL
    SELECT buyer_id, MAX(app.metric_day_ist(estimate_date, created_at)) AS last_day, SUM(total_amount) AS value
    FROM app.estimates
    WHERE v_primary = 'estimates' AND tenant_id = p_tenant_id AND deleted_at IS NULL AND is_buyer_app_estimate
    GROUP BY buyer_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('buyer_id', ranked.id, 'name', ranked.business_name, 'last_demand_day', ranked.last_day, 'value', ranked.value) ORDER BY ranked.last_day NULLS FIRST, ranked.value DESC), '[]'::jsonb)
  INTO v_inactive_after_demand
  FROM (
    SELECT b.id, b.business_name, ad.last_day, ad.value
    FROM app_demand ad
    JOIN app.buyers b ON b.id = ad.buyer_id
    WHERE ad.last_day < v_today - 30
    ORDER BY ad.last_day NULLS FIRST, ad.value DESC
    LIMIT 3
  ) ranked;

  IF v_primary = 'orders' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ranked.id, 'buyer_id', ranked.buyer_id, 'status', ranked.status, 'value', ranked.total_amount) ORDER BY ranked.updated_at NULLS FIRST, ranked.total_amount DESC), '[]'::jsonb)
    INTO v_operational_action
    FROM (
      SELECT o.id, o.buyer_id, o.status, o.total_amount, o.updated_at
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.deleted_at IS NULL
        AND o.is_buyer_app_order
        AND app.order_status_is_open(o.status)
      ORDER BY o.updated_at NULLS FIRST, o.total_amount DESC
      LIMIT 3
    ) ranked;
  ELSIF v_primary = 'estimates' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ranked.id, 'buyer_id', ranked.buyer_id, 'status', ranked.status, 'value', ranked.total_amount) ORDER BY ranked.updated_at NULLS FIRST, ranked.total_amount DESC), '[]'::jsonb)
    INTO v_operational_action
    FROM (
      SELECT e.id, e.buyer_id, e.status, e.total_amount, e.updated_at
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id
        AND e.deleted_at IS NULL
        AND e.is_buyer_app_estimate
        AND app.estimate_status_is_open(e.status)
      ORDER BY e.updated_at NULLS FIRST, e.total_amount DESC
      LIMIT 3
    ) ranked;
  END IF;

  v_business_through_app := jsonb_build_object(
    'primary_demand_kind', v_primary,
    'app_primary_demand_value_90d', v_app_demand_value,
    'total_primary_demand_value_90d', v_total_demand_value,
    'app_invoiced_sales_90d', v_app_invoiced_value,
    'total_invoiced_sales_90d', v_total_invoiced_value
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month', month_start,
    'app_demand_value', app_demand_value,
    'total_demand_value', total_demand_value,
    'app_invoice_value', app_invoice_value,
    'total_invoice_value', total_invoice_value
  ) ORDER BY month_start), '[]'::jsonb)
  INTO v_contribution_over_time
  FROM (
    SELECT date_trunc('month', d.day)::date AS month_start,
      SUM(CASE WHEN v_primary = 'orders' THEN d.app_order_value ELSE d.app_estimate_value END) AS app_demand_value,
      SUM(CASE WHEN v_primary = 'orders' THEN d.order_value ELSE d.estimate_value END) AS total_demand_value,
      SUM(d.app_invoice_value) AS app_invoice_value,
      SUM(d.invoice_value) AS total_invoice_value
    FROM app.metrics_tenant_daily d
    WHERE d.tenant_id = p_tenant_id
      AND d.deleted_at IS NULL
      AND d.day >= v_12m_start
      AND d.day <= v_today
    GROUP BY date_trunc('month', d.day)::date
  ) monthly;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'location_id', l.id,
    'name', l.name,
    'app_demand_value_90d', demand_value,
    'app_invoiced_sales_90d', invoice_value,
    'active_buyers_90d', active_buyers
  ) ORDER BY invoice_value DESC, demand_value DESC), '[]'::jsonb)
  INTO v_adoption_by_location
  FROM (
    SELECT l.id, l.name,
      COALESCE(SUM(ld.app_invoice_value), 0) AS invoice_value,
      COALESCE(SUM(CASE WHEN v_primary = 'orders' THEN ld.app_order_value ELSE ld.app_estimate_value END), 0) AS demand_value,
      COUNT(DISTINCT a.buyer_id) AS active_buyers
    FROM app.locations l
    LEFT JOIN app.metrics_location_daily ld ON ld.tenant_id = l.tenant_id AND ld.location_id = l.id AND ld.deleted_at IS NULL AND ld.day >= v_horizon_start
    LEFT JOIN app.buyer_app_activity a ON a.tenant_id = l.tenant_id AND a.location_id = l.id AND a.deleted_at IS NULL AND a.qualifies_for_engagement AND a.occurred_day >= v_horizon_start
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (v_scope_location_ids IS NULL OR l.id = ANY(v_scope_location_ids))
    GROUP BY l.id, l.name
  ) l;

  WITH group_rows AS (
    SELECT c.id, c.name,
      COUNT(DISTINCT cm.buyer_id) FILTER (WHERE b.buyer_app_enabled) AS enabled_buyers,
      COUNT(DISTINCT a.buyer_id) AS active_buyers
    FROM app.cohorts c
    JOIN app.cohort_members cm ON cm.cohort_id = c.id
    JOIN app.buyers b ON b.id = cm.buyer_id
    LEFT JOIN app.buyer_app_activity a ON a.tenant_id = c.tenant_id AND a.buyer_id = cm.buyer_id AND a.deleted_at IS NULL AND a.qualifies_for_engagement AND a.occurred_day >= v_horizon_start
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
    GROUP BY c.id, c.name
    ORDER BY active_buyers DESC, enabled_buyers DESC
    LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('group_id', id, 'name', name, 'enabled_buyers', enabled_buyers, 'active_buyers', active_buyers)), '[]'::jsonb)
  INTO v_adoption_by_group
  FROM group_rows;

  v_assisted_quality := jsonb_build_object(
    'available', v_primary = 'orders',
    'unavailable_reason', CASE WHEN v_primary <> 'orders' THEN 'Cancellation quality comparison is available only for Order-primary tenants.' ELSE NULL END,
    'app_cancellation_rate_pct', CASE WHEN v_demand_count > 0 THEN ROUND((v_cancelled_count::numeric / v_demand_count::numeric) * 100, 2) ELSE NULL END
  );

  v_moving_to_app := jsonb_build_array();

  RETURN jsonb_build_object(
    'as_of', v_as_of,
    'commercial_horizon_days', 90,
    'table_period', NULL,
    'primary_demand_kind', v_primary,
    'calculation_version', 1,
    'source_watermark', GREATEST(v_buyer_app.source_watermark, v_setup.source_watermark, v_commercial.source_watermark),
    'freshness', jsonb_build_object(
      'buyer_app_source_watermark', v_buyer_app.source_watermark,
      'buyer_app_computed_at', v_buyer_app.computed_at,
      'setup_source_watermark', v_setup.source_watermark,
      'setup_computed_at', v_setup.computed_at,
      'commercial_source_watermark', v_commercial.source_watermark,
      'commercial_computed_at', v_commercial.computed_at
    ),
    'availability', jsonb_build_object(
      'primary_demand', jsonb_build_object('available', v_primary <> 'none', 'kind', v_primary),
      'demand_cancellation_rate', v_assisted_quality,
      'adoption_by_customer_group', jsonb_build_object('available', jsonb_array_length(v_adoption_by_group) > 0)
    ),
    'metrics', jsonb_build_array(
      app.metrics_v2_foundation_item('customers_with_access', 'Customers with Buyer App access', 'NOW', 'READY', NULL, v_enabled_buyers, 'count'),
      app.metrics_v2_foundation_item('customers_submitting_app_demand', 'Customers submitting app demand', '90D', 'REWORK', NULL, v_demand_customers, 'count', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, jsonb_build_object('primary_demand_kind', v_primary)),
      app.metrics_v2_foundation_item('app_sourced_invoiced_sales_share', 'App-sourced invoiced sales + share', '90D', 'REWORK', CASE WHEN v_total_invoiced_value > 0 THEN ROUND((v_app_invoiced_value / v_total_invoiced_value) * 100, 2) ELSE 0 END, NULL, 'percent', true, NULL, jsonb_build_object('app_invoiced_sales_90d', v_app_invoiced_value, 'total_invoiced_sales_90d', v_total_invoiced_value)),
      app.metrics_v2_foundation_item('repeat_app_customers', 'Repeat app customers', '90D', 'REWORK', NULL, v_repeat_customers, 'count', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, '{}'::jsonb),
      app.metrics_v2_foundation_item('app_sourced_demand_value_share', 'App-sourced demand value + share', '90D', 'REWORK', CASE WHEN v_total_demand_value > 0 THEN ROUND((v_app_demand_value / v_total_demand_value) * 100, 2) ELSE 0 END, v_demand_count, 'percent', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, jsonb_build_object('app_demand_value_90d', v_app_demand_value, 'total_demand_value_90d', v_total_demand_value)),
      app.metrics_v2_foundation_item('customers_who_used_app', 'Customers who used the app', '90D', 'READY', NULL, v_used_buyers, 'count'),
      app.metrics_v2_foundation_item('demand_cancellation_rate', 'Demand cancellation rate', '90D', 'CONDITIONAL', CASE WHEN v_demand_count > 0 THEN ROUND((v_cancelled_count::numeric / v_demand_count::numeric) * 100, 2) ELSE NULL END, v_cancelled_count, 'percent', v_primary = 'orders', CASE WHEN v_primary <> 'orders' THEN 'Cancellation rate is only reliable for Order-primary tenants.' ELSE NULL END, '{}'::jsonb),
      app.metrics_v2_foundation_item('average_demand_docs_per_enabled_customer', 'Average demand documents per enabled customer', '90D', 'REWORK', CASE WHEN v_enabled_buyers > 0 THEN ROUND(v_demand_count::numeric / v_enabled_buyers::numeric, 2) ELSE NULL END, v_demand_count, 'ratio', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, '{}'::jsonb)
    ),
    'actions', jsonb_build_array(
      app.metrics_v2_foundation_item('valuable_assisted_customers_without_access', 'Valuable assisted customers without app access', 'NOW + 90D', 'REWORK', NULL, jsonb_array_length(v_assisted_without_access), 'count', true, NULL, jsonb_build_object('rows', v_assisted_without_access)),
      app.metrics_v2_foundation_item('access_enabled_but_never_used', 'Access enabled but never used', 'NOW', 'READY', NULL, jsonb_array_length(v_enabled_never_used), 'count', true, NULL, jsonb_build_object('rows', v_enabled_never_used)),
      app.metrics_v2_foundation_item('used_app_but_no_demand', 'Used the app but submitted no demand', 'NOW + 90D', 'REWORK', NULL, jsonb_array_length(v_used_no_demand), 'count', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, jsonb_build_object('rows', v_used_no_demand)),
      app.metrics_v2_foundation_item('previously_submitted_app_demand_now_inactive', 'Previously submitted app demand, now inactive', 'NOW + 90D', 'REWORK', NULL, jsonb_array_length(v_inactive_after_demand), 'count', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, jsonb_build_object('rows', v_inactive_after_demand)),
      app.metrics_v2_foundation_item('app_demand_needing_operational_action', 'App demand needing operational action', 'NOW', 'REWORK', NULL, jsonb_array_length(v_operational_action), 'count', v_primary <> 'none', CASE WHEN v_primary = 'none' THEN 'No primary demand module is enabled.' ELSE NULL END, jsonb_build_object('rows', v_operational_action))
    ),
    'explore', jsonb_build_array(
      app.metrics_v2_foundation_item('adoption_funnel', 'Adoption funnel', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, jsonb_build_object('access', v_enabled_buyers, 'used', v_used_buyers, 'submitted_primary_demand', v_demand_customers, 'repeat', v_repeat_customers)),
      app.metrics_v2_foundation_item('business_through_app', 'Business through the app', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, v_business_through_app),
      app.metrics_v2_foundation_item('app_contribution_over_time', 'App contribution over time', '12M', 'REWORK', NULL, NULL, NULL, true, NULL, jsonb_build_object('months', v_contribution_over_time)),
      app.metrics_v2_foundation_item('adoption_by_location', 'Adoption by location', '90D', 'REWORK', NULL, NULL, NULL, true, NULL, jsonb_build_object('locations', v_adoption_by_location)),
      app.metrics_v2_foundation_item('adoption_by_customer_group', 'Adoption by Customer Group', '90D', 'CONDITIONAL', NULL, NULL, NULL, jsonb_array_length(v_adoption_by_group) > 0, CASE WHEN jsonb_array_length(v_adoption_by_group) = 0 THEN 'No current customer groups are available.' ELSE NULL END, jsonb_build_object('groups', v_adoption_by_group)),
      app.metrics_v2_foundation_item('assisted_versus_app_order_quality', 'Assisted versus app order quality', '90D', 'CONDITIONAL', NULL, NULL, NULL, v_primary = 'orders', CASE WHEN v_primary <> 'orders' THEN 'Order quality comparison is only available for Order-primary tenants.' ELSE NULL END, v_assisted_quality),
      app.metrics_v2_foundation_item('customers_moving_from_assisted_to_app', 'Customers moving from assisted to app', '90D', 'ON-OPEN', NULL, NULL, NULL, true, NULL, jsonb_build_object('rows', v_moving_to_app))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION app.metrics_v2_primary_demand_kind(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_v2_foundation_item(text, text, text, text, numeric, bigint, text, boolean, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_metrics_v2_seller_dashboard(uuid, text, uuid[], timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_metrics_v2_buyer_app_dashboard(uuid, text, uuid[], timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.metrics_v2_primary_demand_kind(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_metrics_v2_seller_dashboard(uuid, text, uuid[], timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_metrics_v2_buyer_app_dashboard(uuid, text, uuid[], timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.metrics_v2_foundation_item(text, text, text, text, numeric, bigint, text, boolean, text, jsonb) TO service_role;
