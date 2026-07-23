-- cohort_members SCD2 fix: app.get_seller_customer_detail_v2's cohort_ids (feeding the
-- customer-detail page's cohort badges) must only include a buyer's currently-active cohort
-- membership. Full function body reproduced verbatim from
-- supabase/migrations/20260719063544_fix_customer_detail_price_list_assignment_scope.sql
-- with only the cohort_members WHERE clause patched (cm.valid_until IS NULL added).

CREATE OR REPLACE FUNCTION app.get_seller_customer_detail_v2(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_period text DEFAULT '90d',
  p_history_period text DEFAULT '12m',
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_history text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit_top, 20), 1), 20);
  v_buyer app.buyers%ROWTYPE;
  v_metrics app.metrics_buyer_snapshot%ROWTYPE;
  v_cards jsonb := '[]'::jsonb;
  v_primary text;
  v_last_invoice_value numeric(14,2) := 0;
  v_last_invoice_date timestamptz;
  v_last_activity_at timestamptz;
  v_last_activity_kind text;
  v_price_lists_assigned bigint := 0;
  v_cohort_ids uuid[];
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['90d']);
  v_history := app.metrics_v2_assert_detail_period(p_history_period, ARRAY['12m', 'ytd', '3m']);

  SELECT *
  INTO v_buyer
  FROM app.buyers
  WHERE tenant_id = p_tenant_id
    AND id = p_buyer_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_metrics
  FROM app.metrics_buyer_snapshot
  WHERE tenant_id = p_tenant_id
    AND buyer_id = p_buyer_id
    AND deleted_at IS NULL;

  v_primary := app.metrics_v2_primary_demand_kind(p_tenant_id);

  SELECT ARRAY_AGG(cm.cohort_id)
  INTO v_cohort_ids
  FROM app.cohort_members cm
  JOIN app.cohorts c
    ON c.id = cm.cohort_id
   AND c.tenant_id = p_tenant_id
   AND c.deleted_at IS NULL
  WHERE cm.buyer_id = p_buyer_id AND cm.valid_until IS NULL;

  SELECT COUNT(DISTINCT pla.price_list_id)
  INTO v_price_lists_assigned
  FROM app.price_list_assignments pla
  JOIN app.price_lists pl
    ON pl.id = pla.price_list_id
   AND pl.tenant_id = p_tenant_id
   AND pl.deleted_at IS NULL
  WHERE pla.deleted_at IS NULL
    AND (
      (pla.target_type = 'buyer' AND pla.target_id = p_buyer_id)
      OR (pla.target_type = 'all_buyers')
      OR (
        pla.target_type = 'cohort'
        AND COALESCE(pla.target_id = ANY(COALESCE(v_cohort_ids, ARRAY[]::uuid[])), false)
      )
    );

  SELECT
    COALESCE(i.total_amount, 0),
    COALESCE(i.invoice_date, i.created_at)
  INTO v_last_invoice_value, v_last_invoice_date
  FROM app.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.buyer_id = p_buyer_id
    AND i.deleted_at IS NULL
    AND i.status <> 'draft'
    AND i.status <> 'void'
  ORDER BY COALESCE(i.invoice_date, i.created_at) DESC, i.id DESC
  LIMIT 1;

  v_last_activity_at := GREATEST(
    COALESCE(v_metrics.last_invoice_at, '-infinity'::timestamptz),
    COALESCE(v_metrics.last_estimate_at, '-infinity'::timestamptz),
    COALESCE(v_metrics.last_order_at, '-infinity'::timestamptz),
    COALESCE(v_metrics.last_buyer_app_activity_at, '-infinity'::timestamptz)
  );

  IF v_last_activity_at = '-infinity'::timestamptz THEN
    v_last_activity_at := NULL;
    v_last_activity_kind := NULL;
  ELSIF v_metrics.last_invoice_at IS NOT NULL AND v_last_activity_at = v_metrics.last_invoice_at THEN
    v_last_activity_kind := 'sale';
  ELSIF v_metrics.last_order_at IS NOT NULL AND v_last_activity_at = v_metrics.last_order_at THEN
    v_last_activity_kind := 'order';
  ELSIF v_metrics.last_estimate_at IS NOT NULL AND v_last_activity_at = v_metrics.last_estimate_at THEN
    v_last_activity_kind := 'estimate';
  ELSE
    v_last_activity_kind := 'buyer app';
  END IF;

  v_cards := v_cards || jsonb_build_array(
    app.metrics_v2_detail_card(
      'sales-and-demand-history',
      'unavailable',
      'Sales and demand history',
      'High-cardinality customer history is not stored daily in Metrics V2',
      upper(v_history),
      'unavailable',
      app.metrics_v2_empty_card_body('Unavailable', 'Customer history requires an on-open V2 read model; V1 buyer daily facts are intentionally not used.')
    ),
    app.metrics_v2_detail_card(
      'products-requested-repeatedly',
      'unavailable',
      'Products requested repeatedly',
      'Bounded product-repeat read model pending',
      '90D',
      'unavailable',
      app.metrics_v2_empty_card_body('Unavailable', 'No V2 product-repeat read model exists for this customer yet.')
    ),
    app.metrics_v2_detail_card(
      'what-this-customer-buys',
      'unavailable',
      'What this customer buys',
      'Contribution mix',
      '90D',
      'unavailable',
      app.metrics_v2_empty_card_body('Unavailable', 'No V2 customer mix read model exists yet.')
    ),
    app.metrics_v2_detail_card(
      'payment-behavior',
      'distribution',
      'Payment behavior',
      'Current receivables and credit posture',
      'NOW',
      CASE WHEN v_metrics.id IS NULL THEN 'unavailable' ELSE 'ready' END,
      jsonb_build_object(
        'items', CASE WHEN v_metrics.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
          jsonb_build_object('id', 'receivable', 'label', 'Receivable', 'value', v_metrics.receivable_amount),
          jsonb_build_object('id', 'overdue', 'label', 'Overdue', 'value', v_metrics.overdue_amount),
          jsonb_build_object('id', 'credit-available', 'label', 'Credit available', 'value', COALESCE(v_metrics.credit_available, 0))
        ) END,
        'emptyTitle', 'Payment behavior is unavailable',
        'emptyDescription', 'Metrics V2 buyer snapshot has not been computed for this customer.'
      )
    )
  );

  RETURN jsonb_build_object(
    'entity_family', 'customers',
    'entity_id', p_buyer_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object(
      'id', v_buyer.id,
      'title', v_buyer.business_name,
      'status_label', CASE WHEN v_buyer.is_active THEN 'Active' ELSE 'Inactive' END
    ),
    'subtitle_meta', jsonb_build_object(
      'buyer_app_status_label', CASE WHEN COALESCE(v_metrics.buyer_app_enabled, v_buyer.buyer_app_enabled, false) THEN 'Buyer App enabled' ELSE 'Buyer App disabled' END,
      'last_activity_at', v_last_activity_at,
      'last_activity_kind', v_last_activity_kind,
      'last_activity_days_ago', CASE
        WHEN v_last_activity_at IS NULL THEN NULL
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_as_of - v_last_activity_at)) / 86400))::integer
      END
    ),
    'summary_metrics', jsonb_build_object(
      'invoiced_sales_90d', COALESCE(v_metrics.invoice_value_90d, 0),
      'invoice_count_90d', COALESCE(v_metrics.invoice_count_90d, 0),
      'primary_demand_kind', v_primary,
      'primary_demand_value_90d', CASE
        WHEN v_primary = 'estimates' THEN COALESCE(v_metrics.estimate_value_90d, 0)
        WHEN v_primary = 'orders' THEN COALESCE(v_metrics.order_value_90d, 0)
        ELSE 0
      END,
      'primary_demand_order_count_90d', COALESCE(v_metrics.order_count_90d, 0),
      'primary_demand_estimate_count_90d', COALESCE(v_metrics.estimate_count_90d, 0),
      'receivable_amount', COALESCE(v_metrics.receivable_amount, 0),
      'credit_available', COALESCE(v_metrics.credit_available, 0),
      'credit_limit', COALESCE(v_metrics.credit_limit, 0),
      'last_invoice_value', COALESCE(v_last_invoice_value, 0),
      'last_invoice_date', v_last_invoice_date,
      'last_activity_at', v_last_activity_at,
      'last_activity_kind', v_last_activity_kind
    ),
    'kpi_grid', jsonb_build_array(
      jsonb_build_object('label', 'Invoiced sales 90D', 'value', COALESCE(v_metrics.invoice_value_90d, 0)),
      jsonb_build_object('label', 'Invoices 90D', 'value', COALESCE(v_metrics.invoice_count_90d, 0)),
      jsonb_build_object('label', 'Demand 90D', 'value', CASE
        WHEN v_primary = 'estimates' THEN COALESCE(v_metrics.estimate_value_90d, 0)
        WHEN v_primary = 'orders' THEN COALESCE(v_metrics.order_value_90d, 0)
        ELSE 0
      END),
      jsonb_build_object('label', 'Receivable', 'value', COALESCE(v_metrics.receivable_amount, 0)),
      jsonb_build_object('label', 'Credit available', 'value', COALESCE(v_metrics.credit_available, 0)),
      jsonb_build_object('label', 'Credit limit', 'value', COALESCE(v_metrics.credit_limit, 0))
    ),
    'tab_badges', jsonb_build_object(
      'estimates_90d', COALESCE(v_metrics.estimate_count_90d, 0),
      'orders_90d', COALESCE(v_metrics.order_count_90d, 0),
      'invoices_90d', COALESCE(v_metrics.invoice_count_90d, 0),
      'price_lists_assigned', COALESCE(v_price_lists_assigned, 0)
    ),
    'performance_cards', v_cards
  );
END;
$$;
