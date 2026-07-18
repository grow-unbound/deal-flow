-- Metrics V2: surface app.metrics_v2_transaction_landing's already-computed
-- open_estimate_value in its estimates-kind response.
--
-- Product-doc gap sweep (Operations section) found the "Open estimates"
-- landing Pulse card renders count-only, no currency value, even though the
-- RPC already SELECTs open_estimate_value into v_open_value from
-- metrics_location_snapshot / metrics_tenant_commercial_snapshot -- it was
-- computed and then silently dropped before the final jsonb_build_object.
-- This migration only adds the missing field to the return payload; no
-- query logic changes.

CREATE OR REPLACE FUNCTION app.metrics_v2_transaction_landing(
  p_tenant_id uuid,
  p_kind text,
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
  v_today date := (p_as_of AT TIME ZONE 'Asia/Kolkata')::date;
  v_month date := date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata')::date;
  v_prev_month date := (date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata') - interval '1 month')::date;
  v_prev_end date := v_month - 1;
  v_location_scoped boolean := COALESCE(array_length(p_location_ids, 1), 0) > 0;
  v_current_count numeric := 0;
  v_current_value numeric := 0;
  v_prev_count numeric := 0;
  v_prev_value numeric := 0;
  v_open_count numeric := 0;
  v_open_value numeric := 0;
  v_one numeric := 0;
  v_two numeric := 0;
  v_three numeric := 0;
  v_four numeric := 0;
  v_source_watermark timestamptz;
  v_computed_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'metrics_v2_transaction_landing_tenant_required' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind <> ALL (ARRAY['estimates', 'orders', 'invoices']) THEN
    RAISE EXCEPTION 'metrics_v2_transaction_landing_kind_invalid:%', p_kind USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'estimates' THEN
    IF v_location_scoped THEN
      SELECT
        COALESCE(SUM(estimate_count) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(estimate_count) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_location_daily
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND day BETWEEN v_prev_month AND v_today
        AND deleted_at IS NULL;

      SELECT COALESCE(SUM(open_estimate_count), 0), COALESCE(SUM(open_estimate_value), 0)
      INTO v_open_count, v_open_value
      FROM app.metrics_location_snapshot
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND deleted_at IS NULL;
    ELSE
      SELECT
        COALESCE(SUM(estimate_count) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(estimate_count) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_daily
      WHERE tenant_id = p_tenant_id
        AND day BETWEEN v_prev_month AND v_today
        AND deleted_at IS NULL;

      SELECT open_estimate_count, open_estimate_value, GREATEST(source_watermark, v_source_watermark), GREATEST(computed_at, v_computed_at)
      INTO v_open_count, v_open_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_commercial_snapshot
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL;
    END IF;

    SELECT
      COUNT(*) FILTER (WHERE status = 'draft'),
      COUNT(*) FILTER (WHERE status = 'sent'),
      COUNT(*) FILTER (WHERE status = 'accepted'),
      COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced') AND app.metric_day_ist(estimate_date, created_at) BETWEEN v_month AND v_today)
    INTO v_one, v_two, v_three, v_four
    FROM app.estimates
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND (NOT v_location_scoped OR location_id = ANY (p_location_ids))
      AND (
        app.estimate_status_is_open(status)
        OR app.metric_day_ist(estimate_date, created_at) BETWEEN v_month AND v_today
      );

    RETURN jsonb_build_object(
      'as_of', p_as_of,
      'table_period_owner', 'toolbar',
      'headline_period', 'this_month',
      'action_period', 'now',
      'commercial_horizon_days', 90,
      'source_watermark', v_source_watermark,
      'computed_at', v_computed_at,
      'kpis', jsonb_build_object(
        'total_estimates_this_period', v_current_count,
        'total_estimates_prev_period', v_prev_count,
        'total_estimates_growth_pct', CASE WHEN v_prev_count > 0 THEN ROUND(((v_current_count - v_prev_count) / v_prev_count) * 100) ELSE 0 END,
        'total_gmv_this_period', v_current_value,
        'total_gmv_prev_period', v_prev_value,
        'aov', CASE WHEN v_current_count > 0 THEN v_current_value / v_current_count ELSE 0 END,
        'open_estimates_this_period', v_open_count,
        'open_estimate_value', v_open_value,
        'open_total', v_open_count,
        'open_drafts', v_one,
        'open_sent', v_two,
        'open_accepted', v_three,
        'ready_to_convert', v_three,
        'expiring_soon', 0,
        'converted_this_period', v_four,
        'open_created_this_period', v_current_count,
        'buyer_app_created_this_period', 0
      )
    );
  ELSIF p_kind = 'orders' THEN
    IF v_location_scoped THEN
      SELECT
        COALESCE(SUM(order_count) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(order_count) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_location_daily
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND day BETWEEN v_prev_month AND v_today
        AND deleted_at IS NULL;

      SELECT COALESCE(SUM(open_order_count), 0), COALESCE(SUM(open_order_value), 0)
      INTO v_open_count, v_open_value
      FROM app.metrics_location_snapshot
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND deleted_at IS NULL;
    ELSE
      SELECT
        COALESCE(SUM(order_count) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(order_count) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_daily
      WHERE tenant_id = p_tenant_id
        AND day BETWEEN v_prev_month AND v_today
        AND deleted_at IS NULL;

      SELECT open_order_count, open_order_value, GREATEST(source_watermark, v_source_watermark), GREATEST(computed_at, v_computed_at)
      INTO v_open_count, v_open_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_commercial_snapshot
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL;
    END IF;

    SELECT
      COUNT(DISTINCT buyer_id) FILTER (WHERE app.metric_day_ist(order_date, created_at) BETWEEN v_month AND v_today AND app.order_status_in_flow(status)),
      COUNT(*) FILTER (WHERE status IN ('confirmed')),
      COUNT(*) FILTER (WHERE status IN ('received', 'draft', 'open')),
      COUNT(*) FILTER (WHERE status = 'delivered')
    INTO v_one, v_two, v_three, v_four
    FROM app.orders
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND (NOT v_location_scoped OR location_id = ANY (p_location_ids))
      AND (
        app.order_status_is_open(status)
        OR app.metric_day_ist(order_date, created_at) BETWEEN v_month AND v_today
      );

    RETURN jsonb_build_object(
      'as_of', p_as_of,
      'table_period_owner', 'toolbar',
      'headline_period', 'this_month',
      'action_period', 'now',
      'commercial_horizon_days', 90,
      'source_watermark', v_source_watermark,
      'computed_at', v_computed_at,
      'kpis', jsonb_build_object(
        'orders_mtd', v_current_count,
        'orders_prev_mtd', v_prev_count,
        'orders_growth_pct', CASE WHEN v_prev_count > 0 THEN ROUND(((v_current_count - v_prev_count) / v_prev_count) * 100) ELSE 0 END,
        'gmv_mtd', v_current_value,
        'gmv_prev_mtd', v_prev_value,
        'aov', CASE WHEN v_current_count > 0 THEN v_current_value / v_current_count ELSE 0 END,
        'pending_dispatch_count', v_two,
        'received_count', v_three,
        'delivered_count', v_four,
        'buyers_mtd', v_one,
        'open_total', v_open_count,
        'open_value', v_open_value
      )
    );
  ELSE
    IF v_location_scoped THEN
      SELECT
        COALESCE(SUM(invoice_count) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(invoice_count) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_location_daily
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND day BETWEEN v_prev_month AND v_today
        AND deleted_at IS NULL;

      SELECT
        COUNT(*),
        COALESCE(SUM(i.outstanding_balance), 0),
        COUNT(*) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)),
        COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)
      INTO v_one, v_two, v_three, v_four
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.deleted_at IS NULL
        AND i.location_id = ANY (p_location_ids)
        AND app.invoice_status_has_receivable(i.status, i.outstanding_balance);
    ELSE
      SELECT
        COALESCE(SUM(invoice_count) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day BETWEEN v_month AND v_today), 0),
        COALESCE(SUM(invoice_count) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day BETWEEN v_prev_month AND v_prev_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_daily
      WHERE tenant_id = p_tenant_id
        AND day BETWEEN v_prev_month AND v_today
        AND deleted_at IS NULL;

      SELECT
        receivable_invoice_count,
        receivable_amount,
        overdue_invoice_count,
        overdue_amount,
        GREATEST(source_watermark, v_source_watermark),
        GREATEST(computed_at, v_computed_at)
      INTO v_one, v_two, v_three, v_four, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_commercial_snapshot
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
      'as_of', p_as_of,
      'table_period_owner', 'toolbar',
      'headline_period', 'this_month',
      'action_period', 'now',
      'commercial_horizon_days', 90,
      'source_watermark', v_source_watermark,
      'computed_at', v_computed_at,
      'kpis', jsonb_build_object(
        'invoices_this_period', v_current_count,
        'invoices_prev_period', v_prev_count,
        'invoices_growth_pct', CASE WHEN v_prev_count > 0 THEN ROUND(((v_current_count - v_prev_count) / v_prev_count) * 100) ELSE 0 END,
        'gmv_this_period', v_current_value,
        'gmv_prev_period', v_prev_value,
        'aov', CASE WHEN v_current_count > 0 THEN v_current_value / v_current_count ELSE 0 END,
        'overdue_count', v_three,
        'overdue_sum', v_four,
        'outstanding_count', v_one,
        'outstanding_sum', v_two
      )
    );
  END IF;
END;
$$;
