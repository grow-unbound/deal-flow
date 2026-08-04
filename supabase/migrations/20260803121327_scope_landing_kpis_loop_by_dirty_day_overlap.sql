-- Root-cause follow-up for the residual metrics_tick_wall_budget_exceeded
-- timeouts on 'commercial' (see specs/kpi-fix-execution-log.md): the
-- period-selector loop unconditionally recomputed all 7 selector variants
-- (today/this_week/last_week/this_month/last_month/this_quarter/
-- last_quarter) for dashboard/estimates/orders/invoices/buyer_app/brands on
-- EVERY tick, regardless of which day was actually dirty -- a tick fixing
-- today's data still redid last_month and last_quarter's numbers too, even
-- though nothing in those periods changed.
--
-- Adds an optional p_dirty_days date[] parameter (default NULL = unchanged
-- behavior, so any standalone/manual caller -- e.g. direct timing tests --
-- keeps recomputing everything). When the caller supplies the actual claimed
-- dirty days, each loop iteration is skipped unless at least one of those
-- days falls within that iteration's [period_start, period_end_exclusive)
-- window. This is a data-driven skip (only recompute periods a dirty day
-- actually touches), not a calendar-driven "close" -- a backdated
-- correction landing in an old period still carries that period's day in
-- its dirty mark, so it still gets recomputed correctly, just cheaply
-- (that one period, not all 7 every time). No staleness introduced beyond
-- what already existed: every period still recomputes on the very next tick
-- that touches it.
--
-- Body below is otherwise a verbatim copy of the current live definition
-- (20260803091852_domain_scope_landing_kpis_and_top80_cache.sql) -- only the
-- new parameter and the loop-skip guard were added.
CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_landing_kpis(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp(),
  p_domain text DEFAULT NULL,
  p_dirty_days date[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_rows integer := 0;
  v_period record;
  v_quarter record;
  v_primary text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_now_summary app.metrics_tenant_now_summary%ROWTYPE;
  v_now timestamptz := COALESCE(p_as_of, clock_timestamp());
  v_watermark timestamptz;
  v_run_commercial boolean := (p_domain IS NULL OR p_domain = 'commercial');
  v_run_inventory boolean := (p_domain IS NULL OR p_domain = 'inventory');
  v_run_buyer_app boolean := (p_domain IS NULL OR p_domain = 'buyer_app');
  v_due_7_count bigint;
  v_due_7_value numeric;
  v_due_7_buyers bigint;
  v_est_awaiting_count bigint;
  v_est_awaiting_value numeric;
  v_est_awaiting_buyers bigint;
  v_est_expiring_count bigint;
  v_est_expiring_value numeric;
  v_est_expiring_buyers bigint;
  v_ord_waiting_count bigint;
  v_ord_waiting_value numeric;
  v_ord_waiting_buyers bigint;
  v_ord_dispatch_count bigint;
  v_ord_dispatch_value numeric;
  v_ord_dispatch_buyers bigint;
  v_active_customers bigint;
  v_dormant_customers bigint;
  v_top80_customers bigint;
  v_sold_products bigint;
  v_oos_products bigint;
  v_low_products bigint;
  v_no_sale_products bigint;
  v_sold_categories bigint;
  v_oos_categories bigint;
  v_low_categories bigint;
  v_no_sale_categories bigint;
  v_live_campaigns bigint;
  v_live_campaigns_expiring bigint;
  v_campaign_views bigint;
  v_campaign_openers bigint;
  v_campaign_demand_count bigint;
  v_campaign_demand_value numeric;
  v_campaign_demand_buyers bigint;
  v_campaign_invoice_count bigint;
  v_campaign_invoice_value numeric;
  v_campaign_invoice_buyers bigint;
  v_active_groups bigint;
  v_grouped_buyers bigint;
  v_valuable_no_group bigint;
  v_grouped_purchased bigint;
  v_custom_price_products bigint;
  v_custom_price_buyers bigint;
  v_below_base_products bigint;
  v_expiring_price_lists bigint;
  v_active_brands bigint;
  v_top80_brands bigint;
  v_no_sale_brands bigint;
  v_dormant_brands bigint;
  v_top80_locations bigint;
  v_sellable_units numeric;
  v_warehouse_skus bigint;
  v_warehouse_oos bigint;
  v_warehouse_no_sales bigint;
BEGIN
  SELECT * INTO v_period FROM app.metrics_v4_period_bounds('this_month', p_as_of);
  SELECT * INTO v_quarter FROM app.metrics_v4_period_bounds('this_quarter', p_as_of);
  SELECT * INTO v_now_summary FROM app.metrics_tenant_now_summary WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY computed_at DESC LIMIT 1;

  SELECT MAX(source_watermark) INTO v_watermark FROM (
    SELECT source_watermark FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id
    UNION ALL SELECT source_watermark FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id
    UNION ALL SELECT source_watermark FROM app.metrics_product_period_summary WHERE tenant_id = p_tenant_id
  ) x;

  IF v_run_commercial THEN
  SELECT
    COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days')::bigint,
    COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days'), 0)::numeric,
    COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days')::bigint
  INTO v_due_7_count, v_due_7_value, v_due_7_buyers
  FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL;

  SELECT
    COUNT(*) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days')::bigint,
    COALESCE(SUM(e.total_amount) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days'),0)::numeric,
    COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days')::bigint,
    COUNT(*) FILTER (WHERE (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7)::bigint,
    COALESCE(SUM(e.total_amount) FILTER (WHERE (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7),0)::numeric,
    COUNT(DISTINCT e.buyer_id) FILTER (WHERE (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7)::bigint
  INTO v_est_awaiting_count, v_est_awaiting_value, v_est_awaiting_buyers, v_est_expiring_count, v_est_expiring_value, v_est_expiring_buyers
  FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  SELECT
    COUNT(*) FILTER (WHERE o.status = 'received')::bigint,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'received'),0)::numeric,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'received')::bigint,
    COUNT(*) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days')::bigint,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days'),0)::numeric,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days')::bigint
  INTO v_ord_waiting_count, v_ord_waiting_value, v_ord_waiting_buyers, v_ord_dispatch_count, v_ord_dispatch_value, v_ord_dispatch_buyers
  FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL;

  SELECT COUNT(*) FILTER (WHERE bps.invoice_count > 0)::bigint
  INTO v_active_customers
  FROM app.metrics_buyer_period_summary bps
  WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'quarter' AND bps.period_start = v_quarter.period_start AND bps.deleted_at IS NULL;
  SELECT GREATEST(COALESCE(v_now_summary.active_buyer_count, 0) - COALESCE(v_active_customers, 0), 0) INTO v_dormant_customers;
  SELECT COALESCE(top80.top80_count, 0) INTO v_top80_customers
  FROM app.metrics_tenant_top80_cache top80
  WHERE top80.tenant_id = p_tenant_id AND top80.entity_kind = 'customers' AND top80.grain = 'quarter' AND top80.period_start = v_quarter.period_start;

  SELECT
    COUNT(*) FILTER (WHERE ps.invoice_count > 0)::bigint,
    COUNT(*) FILTER (WHERE ps.invoice_count > 0 AND COALESCE(snap.available, snap.on_hand, 0) <= 0)::bigint,
    COUNT(*) FILTER (WHERE ps.invoice_count > 0 AND (snap.low_stock OR COALESCE(snap.days_cover, 999999) <= 14))::bigint
  INTO v_sold_products, v_oos_products, v_low_products
  FROM app.metrics_product_period_summary ps
  JOIN app.metrics_product_snapshot snap ON snap.tenant_product_id = ps.tenant_product_id AND snap.tenant_id = p_tenant_id AND snap.deleted_at IS NULL
  WHERE ps.tenant_id = p_tenant_id AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL;
  SELECT COUNT(*)::bigint INTO v_no_sale_products
  FROM app.metrics_product_snapshot snap
  WHERE snap.tenant_id = p_tenant_id AND snap.deleted_at IS NULL AND snap.is_active AND COALESCE(snap.available, snap.on_hand, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_product_period_summary ps
      WHERE ps.tenant_id = p_tenant_id AND ps.tenant_product_id = snap.tenant_product_id
        AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0
    );

  SELECT COUNT(*) FILTER (WHERE cps.invoice_count > 0)::bigint INTO v_sold_categories
  FROM app.metrics_category_period_summary cps
  WHERE cps.tenant_id = p_tenant_id AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start AND cps.deleted_at IS NULL;
  SELECT COUNT(DISTINCT tp.tenant_category_id) FILTER (WHERE snap.out_of_stock)::bigint,
         COUNT(DISTINCT tp.tenant_category_id) FILTER (WHERE snap.low_stock OR COALESCE(snap.days_cover, 999999) <= 14)::bigint
  INTO v_oos_categories, v_low_categories
  FROM app.metrics_product_period_summary ps
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id
  JOIN app.metrics_product_snapshot snap ON snap.tenant_product_id = ps.tenant_product_id AND snap.tenant_id = p_tenant_id AND snap.deleted_at IS NULL
  WHERE ps.tenant_id = p_tenant_id AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0;
  SELECT COUNT(*)::bigint INTO v_no_sale_categories
  FROM app.tenant_categories tc
  WHERE tc.tenant_id = p_tenant_id AND tc.deleted_at IS NULL AND tc.is_active
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_category_period_summary cps
      WHERE cps.tenant_id = p_tenant_id AND cps.tenant_category_id = tc.id
        AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start AND cps.deleted_at IS NULL
    );

  SELECT COUNT(DISTINCT pli.tenant_product_id)::bigint,
         COUNT(DISTINCT pli.tenant_product_id) FILTER (WHERE pli.price < tp.base_selling_price)::bigint
  INTO v_custom_price_products, v_below_base_products
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
  WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL AND pli.deleted_at IS NULL
    AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now);
  SELECT COUNT(DISTINCT buyer_id)::bigint INTO v_custom_price_buyers FROM (
    SELECT pla.target_id AS buyer_id
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    WHERE pl.tenant_id = p_tenant_id AND pla.deleted_at IS NULL AND pla.target_type = 'buyer'
      AND pl.deleted_at IS NULL AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now)
    UNION
    SELECT cm.buyer_id
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    JOIN app.cohort_members_active cm ON cm.cohort_id = pla.target_id
    WHERE pl.tenant_id = p_tenant_id AND pla.deleted_at IS NULL AND pla.target_type = 'cohort'
      AND pl.deleted_at IS NULL AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now)
  ) x WHERE buyer_id IS NOT NULL;
  SELECT COUNT(*)::bigint INTO v_expiring_price_lists
  FROM app.price_lists pl WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL AND pl.is_active
    AND pl.valid_to IS NOT NULL AND pl.valid_to >= v_now AND pl.valid_to < v_now + interval '7 days';

  SELECT COUNT(*)::bigint INTO v_active_brands
  FROM app.metrics_brand_period_summary bps WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'month' AND bps.period_start = v_period.period_start AND bps.deleted_at IS NULL;
  SELECT COALESCE(top80.top80_count, 0) INTO v_top80_brands
  FROM app.metrics_tenant_top80_cache top80
  WHERE top80.tenant_id = p_tenant_id AND top80.entity_kind = 'brands' AND top80.grain = 'month' AND top80.period_start = v_period.period_start;
  SELECT GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE(v_active_brands,0), 0) INTO v_no_sale_brands;
  SELECT COUNT(*)::bigint INTO v_dormant_brands
  FROM app.metrics_brand_period_summary prev
  WHERE prev.tenant_id = p_tenant_id AND prev.grain = 'month' AND prev.period_start = v_period.previous_start AND prev.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_brand_period_summary cur
      WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id
        AND cur.grain = 'month' AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL
    );
  END IF;

  IF v_run_buyer_app THEN
  SELECT COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE c.valid_to IS NOT NULL AND c.valid_to < v_now + interval '7 days')::bigint
  INTO v_live_campaigns, v_live_campaigns_expiring
  FROM app.campaigns c
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND c.status = 'published'
    AND c.valid_from <= v_now AND (c.valid_to IS NULL OR c.valid_to >= v_now);
  SELECT
    COALESCE(SUM(view_count),0)::bigint, COALESCE(SUM(viewed_buyer_count),0)::bigint,
    COALESCE(SUM(estimate_count + order_count),0)::bigint, COALESCE(SUM(estimate_value + order_value),0)::numeric,
    COALESCE(SUM(demand_buyer_count),0)::bigint,
    COALESCE(SUM(invoice_count),0)::bigint, COALESCE(SUM(invoice_value),0)::numeric, COALESCE(SUM(revenue_buyer_count),0)::bigint
  INTO v_campaign_views, v_campaign_openers, v_campaign_demand_count, v_campaign_demand_value, v_campaign_demand_buyers,
       v_campaign_invoice_count, v_campaign_invoice_value, v_campaign_invoice_buyers
  FROM app.metrics_campaign_period_summary
  WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL;
  END IF;

  IF v_run_commercial OR v_run_buyer_app THEN
  SELECT COUNT(*)::bigint INTO v_active_groups FROM app.cohorts c WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL;
  SELECT COUNT(DISTINCT cm.buyer_id)::bigint INTO v_grouped_buyers
  FROM app.cohorts c JOIN app.cohort_members_active cm ON cm.cohort_id = c.id
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL;
  SELECT COUNT(*)::bigint INTO v_valuable_no_group
  FROM app.metrics_buyer_period_summary bps
  WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'quarter' AND bps.period_start = v_quarter.period_start
    AND bps.deleted_at IS NULL AND bps.invoice_value > 0
    AND NOT EXISTS (SELECT 1 FROM app.cohort_members_active cm WHERE cm.buyer_id = bps.buyer_id);
  SELECT COUNT(DISTINCT cps.cohort_id)::bigint INTO v_grouped_purchased
  FROM app.metrics_cohort_period_summary cps
  WHERE cps.tenant_id = p_tenant_id AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start
    AND cps.deleted_at IS NULL AND cps.active_member_count > 0;
  END IF;

  IF v_run_commercial OR v_run_inventory THEN
  SELECT COALESCE(top80.top80_count, 0) INTO v_top80_locations
  FROM app.metrics_tenant_top80_cache top80
  WHERE top80.tenant_id = p_tenant_id AND top80.entity_kind = 'locations' AND top80.grain = 'month' AND top80.period_start = v_period.period_start;
  END IF;

  IF v_run_inventory THEN
  SELECT COALESCE(SUM(ws.sellable_units),0), COALESCE(SUM(ws.tracked_skus),0), COALESCE(SUM(ws.stockout_skus),0)
  INTO v_sellable_units, v_warehouse_skus, v_warehouse_oos
  FROM app.warehouses_snapshot ws WHERE ws.tenant_id = p_tenant_id;
  SELECT COUNT(*)::bigint INTO v_warehouse_no_sales
  FROM app.warehouses_snapshot ws
  WHERE ws.tenant_id = p_tenant_id AND ws.sellable_units > 0
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_warehouse_period_summary wps
      WHERE wps.tenant_id = p_tenant_id AND wps.warehouse_id = ws.warehouse_id
        AND wps.grain = 'quarter' AND wps.period_start = v_quarter.period_start AND wps.deleted_at IS NULL
    );
  END IF;

  IF v_run_commercial THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'dashboard', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', 'month', jsonb_build_object('target','invoices','date_period','this_month')),
    app.metrics_v4_kpi('demand', 'Demand', COALESCE((SELECT primary_demand_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand documents', 'month', jsonb_build_object('target', v_primary, 'date_period','this_month')),
    app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','balance_gt',0)),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','overdue',true))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'estimates', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('estimate_value_created', 'Estimate value created', COALESCE((SELECT estimate_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and estimates', 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('open_estimates', 'Open estimates', COALESCE(v_now_summary.open_estimate_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.estimates WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.estimate_status_is_open(status)),0), COALESCE(v_now_summary.open_estimate_count,0), NULL, 'customers and estimates', 'now', jsonb_build_object('status','open')),
    app.metrics_v4_kpi('awaiting_action_3d', 'Awaiting action 3+ days', v_est_awaiting_value, v_est_awaiting_buyers, v_est_awaiting_count, NULL, 'customers and estimates', 'now', jsonb_build_object('status','sent','age_gte_days',3)),
    app.metrics_v4_kpi('expiring_7d', 'Expiring in 7 days', v_est_expiring_value, v_est_expiring_buyers, v_est_expiring_count, NULL, 'customers and estimates', 'now', jsonb_build_object('expiry_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'orders', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('order_value_created', 'Order value created', COALESCE((SELECT order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and orders', 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('open_orders', 'Open orders', COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.order_status_is_open(status)),0), COALESCE(v_now_summary.open_order_count,0), NULL, 'customers and orders', 'now', jsonb_build_object('status','open')),
    app.metrics_v4_kpi('waiting_confirmation', 'Waiting for confirmation', v_ord_waiting_value, v_ord_waiting_buyers, v_ord_waiting_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','received')),
    app.metrics_v4_kpi('awaiting_dispatch_3d', 'Awaiting dispatch 3+ days', v_ord_dispatch_value, v_ord_dispatch_buyers, v_ord_dispatch_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','confirmed','age_gte_days',3))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'invoices', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('balance_gt',0)),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('due_7d', 'Due in 7 days', v_due_7_value, v_due_7_buyers, v_due_7_count, NULL, 'customers and invoices', 'now', jsonb_build_object('due_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'customers', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_customers', 'Active Customers', v_active_customers, v_active_customers, NULL, NULL, 'purchased at least once', 'quarter', jsonb_build_object('purchased_gte',1,'period','this_quarter')),
    app.metrics_v4_kpi('dormant_customers', 'Dormant Customers', v_dormant_customers, v_dormant_customers, NULL, NULL, 'no purchase in quarter', 'quarter', jsonb_build_object('dormant_period','this_quarter')),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('top80_customers', 'Top customers driving 80% of revenue', v_top80_customers, v_top80_customers, NULL, NULL, 'customers in revenue concentration set', 'quarter', jsonb_build_object('sort','invoice_value_desc','cutoff','top80'))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'products', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('products_sold', 'Products that sold', v_sold_products, v_sold_products, NULL, NULL, 'products sold in quarter', 'quarter', jsonb_build_object('sold_gte',1,'period','this_quarter')),
    app.metrics_v4_kpi('recently_sold_oos', 'Recently sold, now out of stock', v_oos_products, v_oos_products, NULL, NULL, 'sold QTD and stock is zero', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('running_low', 'Products running low', v_low_products, v_low_products, NULL, NULL, 'sold QTD and low stock', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','low')),
    app.metrics_v4_kpi('did_not_sell', 'Products that did not sell', v_no_sale_products, v_no_sale_products, NULL, NULL, 'stocked products with no QTD sale', 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'buyer_app', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('customers_with_access', 'Customers with app access', COALESCE(v_now_summary.enabled_buyer_count,0), COALESCE(v_now_summary.enabled_buyer_count,0), NULL, NULL, 'enabled customers', 'now', jsonb_build_object('buyer_app_enabled',true)),
    app.metrics_v4_kpi('customers_submitting_app_demand', 'Customers submitting App Demand', COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, NULL, 'enabled customers with demand', 'month', jsonb_build_object('source','buyer_app','period','this_month')),
    app.metrics_v4_kpi('app_sourced_demand', 'App-sourced Demand', COALESCE((SELECT app_estimate_value + app_order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_count + app_order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand docs', 'month', jsonb_build_object('source','buyer_app','period','this_month')),
    app.metrics_v4_kpi('repeat_app_customers', 'Repeat App Customers', COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), NULL, NULL, 'two or more app demand docs', 'quarter', jsonb_build_object('source','buyer_app','demand_count_gte',2,'period','this_quarter'))
  ), v_watermark);
  END IF;

  IF v_run_buyer_app THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'campaigns', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('live_campaigns', 'Live Campaigns', v_live_campaigns, v_live_campaigns, NULL, v_live_campaigns_expiring, 'expiring in 7 days', 'now', jsonb_build_object('status','live')),
    app.metrics_v4_kpi('campaign_open_rate', 'Campaign Open rate', v_campaign_openers, v_campaign_openers, v_campaign_views, NULL, 'customers viewed', 'quarter', jsonb_build_object('period','this_quarter','has_views',true)),
    app.metrics_v4_kpi('campaign_demand', 'Campaign demand', v_campaign_demand_value, v_campaign_demand_buyers, v_campaign_demand_count, NULL, 'customers and demand docs', 'quarter', jsonb_build_object('period','this_quarter','has_demand',true)),
    app.metrics_v4_kpi('campaign_revenue', 'Campaign revenue', v_campaign_invoice_value, v_campaign_invoice_buyers, v_campaign_invoice_count, NULL, 'customers and invoices', 'quarter', jsonb_build_object('period','this_quarter','has_revenue',true))
  ), v_watermark);
  END IF;

  IF v_run_commercial OR v_run_buyer_app THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'customer_groups', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_groups', 'Active groups', v_active_groups, v_active_groups, NULL, v_grouped_buyers, 'assigned customers', 'now', jsonb_build_object('status','active')),
    app.metrics_v4_kpi('customers_assigned', 'Customers assigned to a group', v_grouped_buyers, v_grouped_buyers, NULL, COALESCE(v_now_summary.active_buyer_count,0), 'of total customers', 'now', jsonb_build_object('group','not_null')),
    app.metrics_v4_kpi('valuable_no_group', 'Valuable customers in no group', v_valuable_no_group, v_valuable_no_group, NULL, NULL, 'top revenue customers without group', 'quarter_now', jsonb_build_object('group','none','valuable_period','this_quarter')),
    app.metrics_v4_kpi('grouped_purchased', 'Grouped customers who purchased', v_grouped_purchased, v_grouped_purchased, NULL, NULL, 'groups with purchasing members', 'quarter', jsonb_build_object('member_purchased_period','this_quarter'))
  ), v_watermark);
  END IF;

  IF v_run_commercial THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'price_lists', 'now', (v_now AT TIME ZONE 'Asia/Kolkata')::date, jsonb_build_array(
    app.metrics_v4_kpi('custom_price_products', 'Products with custom prices', v_custom_price_products, v_custom_price_products, NULL, COALESCE(v_now_summary.active_product_count,0), 'of all products', 'now', jsonb_build_object('has_custom_price',true)),
    app.metrics_v4_kpi('custom_price_customers', 'Customers with custom pricing', v_custom_price_buyers, v_custom_price_buyers, NULL, COALESCE(v_now_summary.active_buyer_count,0), 'direct or cohort assignment', 'now', jsonb_build_object('has_custom_pricing',true)),
    app.metrics_v4_kpi('below_base_products', 'Products below base rate', v_below_base_products, v_below_base_products, NULL, NULL, 'active overrides below base', 'now', jsonb_build_object('price_below_base',true)),
    app.metrics_v4_kpi('expiring_7d', 'Price lists expiring in 7 days', v_expiring_price_lists, v_expiring_price_lists, NULL, NULL, 'active price lists', 'now', jsonb_build_object('expiry_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'brands', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_brands', 'Active brands', v_active_brands, v_active_brands, NULL, COALESCE(v_now_summary.active_brand_count,0), 'of all brands', 'month', jsonb_build_object('sold_period','this_month')),
    app.metrics_v4_kpi('top80_brands', 'Top 80% brands', v_top80_brands, v_top80_brands, NULL, NULL, 'brands in revenue concentration set', 'month', jsonb_build_object('sort','invoice_value_desc','cutoff','top80')),
    app.metrics_v4_kpi('did_not_sell', 'Brands that did not sell', v_no_sale_brands, v_no_sale_brands, NULL, NULL, 'no selected-period sale', 'month', jsonb_build_object('not_sold_period','this_month')),
    app.metrics_v4_kpi('dormant_brands', 'Dormant brands', v_dormant_brands, v_dormant_brands, NULL, NULL, 'sold last month not this month', 'month', jsonb_build_object('sold_previous_period',true,'sold_current_period',false))
  ), v_watermark);
  END IF;

  IF v_run_commercial OR v_run_inventory THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'locations', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT SUM(invoice_value) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND invoice_value > 0 AND deleted_at IS NULL),0), COALESCE((SELECT SUM(invoice_count)::bigint FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'locations and invoices', 'month', jsonb_build_object('target','invoices','period','this_month')),
    app.metrics_v4_kpi('open_demand', 'Open demand', COALESCE(v_now_summary.open_estimate_value,0) + COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND (open_estimate_count + open_order_count) > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.open_estimate_count,0) + COALESCE(v_now_summary.open_order_count,0), NULL, 'locations and demand docs', 'now', jsonb_build_object('open_demand',true)),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'locations', 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('top80_locations', 'Top 80% locations', v_top80_locations, v_top80_locations, NULL, NULL, 'locations in revenue concentration set', 'month', jsonb_build_object('sort','invoice_value_desc','cutoff','top80'))
  ), v_watermark);
  END IF;

  IF v_run_inventory THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'warehouses', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('sellable_units', 'Sellable Units in stock', v_sellable_units, COALESCE(v_warehouse_skus,0), NULL, NULL, 'products in warehouses', 'now', jsonb_build_object('stock','sellable')),
    app.metrics_v4_kpi('unique_skus', 'Unique SKUs across warehouses', COALESCE(v_warehouse_skus,0), COALESCE(v_now_summary.active_warehouse_count,0), NULL, NULL, 'warehouses', 'now', jsonb_build_object('context','unique_skus')),
    app.metrics_v4_kpi('recently_sold_oos', 'Recently sold, now out of stock', COALESCE(v_warehouse_oos,0), COALESCE(v_warehouse_oos,0), NULL, NULL, 'warehouses with stockouts', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('no_sales', 'No sales in period', v_warehouse_no_sales, v_warehouse_no_sales, NULL, NULL, 'stocked warehouses with no QTD sale', 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);
  END IF;

  IF v_run_commercial THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'categories', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('categories_sold', 'Categories that sold', v_sold_categories, v_sold_categories, NULL, COALESCE(v_now_summary.active_category_count,0), 'of all categories', 'quarter', jsonb_build_object('sold_period','this_quarter')),
    app.metrics_v4_kpi('recently_sold_oos', 'Recently sold, now out of stock', v_oos_categories, v_oos_categories, NULL, NULL, 'sold QTD and stock is zero', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('running_low', 'Categories running low', v_low_categories, v_low_categories, NULL, NULL, 'sold QTD and low stock', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','low')),
    app.metrics_v4_kpi('did_not_sell', 'Categories that did not sell', v_no_sale_categories, v_no_sale_categories, NULL, NULL, 'no QTD sale', 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);

  -- Selector-driven landing pages: materialize every supported selector period
  -- from period summaries so card reads stay O(1) after the frontend split.
  -- Locations was removed from this loop -- per spec, Locations has no
  -- selector at all (Invoiced Sales/Top 80% are both fixed at "This Month"),
  -- so recomputing it here for every one of the 7 selector periods (with a
  -- literal duplicated top80_locations subquery on top) was never correct,
  -- just wasted work. This whole loop is now commercial-only since brands
  -- and everything else left in it are commercial-owned.
  FOR v_period IN SELECT * FROM app.metrics_v4_period_windows(p_as_of)
  LOOP
    IF p_dirty_days IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(p_dirty_days) d WHERE d >= v_period.period_start AND d < v_period.period_end_exclusive
    ) THEN
      CONTINUE;
    END IF;

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'dashboard', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', v_period.grain, jsonb_build_object('target','invoices','date_period',v_period.period_key)),
      app.metrics_v4_kpi('demand', 'Demand', COALESCE((SELECT primary_demand_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand documents', v_period.grain, jsonb_build_object('target', v_primary, 'date_period',v_period.period_key)),
      app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','balance_gt',0)),
      app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','overdue',true))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'estimates', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('estimate_value_created', 'Estimate value created', COALESCE((SELECT estimate_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and estimates', v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('open_estimates', 'Open estimates', COALESCE(v_now_summary.open_estimate_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.estimates WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.estimate_status_is_open(status)),0), COALESCE(v_now_summary.open_estimate_count,0), NULL, 'customers and estimates', 'now', jsonb_build_object('status','open')),
      app.metrics_v4_kpi('awaiting_action_3d', 'Awaiting action 3+ days', v_est_awaiting_value, v_est_awaiting_buyers, v_est_awaiting_count, NULL, 'customers and estimates', 'now', jsonb_build_object('status','sent','age_gte_days',3)),
      app.metrics_v4_kpi('expiring_7d', 'Expiring in 7 days', v_est_expiring_value, v_est_expiring_buyers, v_est_expiring_count, NULL, 'customers and estimates', 'now', jsonb_build_object('expiry_lte_days',7))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'orders', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('order_value_created', 'Order value created', COALESCE((SELECT order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and orders', v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('open_orders', 'Open orders', COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.order_status_is_open(status)),0), COALESCE(v_now_summary.open_order_count,0), NULL, 'customers and orders', 'now', jsonb_build_object('status','open')),
      app.metrics_v4_kpi('waiting_confirmation', 'Waiting for confirmation', v_ord_waiting_value, v_ord_waiting_buyers, v_ord_waiting_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','received')),
      app.metrics_v4_kpi('awaiting_dispatch_3d', 'Awaiting dispatch 3+ days', v_ord_dispatch_value, v_ord_dispatch_buyers, v_ord_dispatch_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','confirmed','age_gte_days',3))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'invoices', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('balance_gt',0)),
      app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('overdue',true)),
      app.metrics_v4_kpi('due_7d', 'Due in 7 days', v_due_7_value, v_due_7_buyers, v_due_7_count, NULL, 'customers and invoices', 'now', jsonb_build_object('due_lte_days',7))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'buyer_app', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('customers_with_access', 'Customers with app access', COALESCE(v_now_summary.enabled_buyer_count,0), COALESCE(v_now_summary.enabled_buyer_count,0), NULL, NULL, 'enabled customers', 'now', jsonb_build_object('buyer_app_enabled',true)),
      app.metrics_v4_kpi('customers_submitting_app_demand', 'Customers submitting App Demand', COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, NULL, 'enabled customers with demand', v_period.grain, jsonb_build_object('source','buyer_app','period',v_period.period_key)),
      app.metrics_v4_kpi('app_sourced_demand', 'App-sourced Demand', COALESCE((SELECT app_estimate_value + app_order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_count + app_order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand docs', v_period.grain, jsonb_build_object('source','buyer_app','period',v_period.period_key)),
      app.metrics_v4_kpi('repeat_app_customers', 'Repeat App Customers', COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), NULL, NULL, 'two or more app demand docs', 'quarter', jsonb_build_object('source','buyer_app','demand_count_gte',2,'period','this_quarter'))
    ), v_watermark);

    IF v_period.grain IN ('month','quarter') THEN
      v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'brands', v_period.period_key, v_period.period_start, jsonb_build_array(
        app.metrics_v4_kpi('active_brands', 'Active brands', COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, COALESCE(v_now_summary.active_brand_count,0), 'of all brands', v_period.grain, jsonb_build_object('sold_period',v_period.period_key)),
        app.metrics_v4_kpi('top80_brands', 'Top 80% brands', COALESCE((SELECT COUNT(*) FROM (SELECT tenant_brand_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), COALESCE((SELECT COUNT(*) FROM (SELECT tenant_brand_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), NULL, NULL, 'brands in revenue concentration set', v_period.grain, jsonb_build_object('sort','invoice_value_desc','cutoff','top80')),
        app.metrics_v4_kpi('did_not_sell', 'Brands that did not sell', GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), 0), GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), 0), NULL, NULL, 'no selected-period sale', v_period.grain, jsonb_build_object('not_sold_period',v_period.period_key)),
        app.metrics_v4_kpi('dormant_brands', 'Dormant brands', COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary prev WHERE prev.tenant_id = p_tenant_id AND prev.grain = v_period.grain AND prev.period_start = CASE WHEN v_period.grain = 'month' THEN (v_period.period_start - interval '1 month')::date ELSE (v_period.period_start - interval '3 months')::date END AND prev.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM app.metrics_brand_period_summary cur WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id AND cur.grain = v_period.grain AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL)),0), COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary prev WHERE prev.tenant_id = p_tenant_id AND prev.grain = v_period.grain AND prev.period_start = CASE WHEN v_period.grain = 'month' THEN (v_period.period_start - interval '1 month')::date ELSE (v_period.period_start - interval '3 months')::date END AND prev.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM app.metrics_brand_period_summary cur WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id AND cur.grain = v_period.grain AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL)),0), NULL, NULL, 'sold prior period not selected period', v_period.grain, jsonb_build_object('sold_previous_period',true,'sold_current_period',false))
      ), v_watermark);
    END IF;
  END LOOP;
  END IF;

  RETURN v_rows;
END;
$$;

ALTER FUNCTION app._metrics_v4_refresh_landing_kpis(uuid, timestamptz, text, date[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_landing_kpis(uuid, timestamptz, text, date[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_landing_kpis(uuid, timestamptz, text, date[]) TO service_role;
