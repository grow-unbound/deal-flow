-- Metrics V2 Phase 6: landing pages in bounded waves.
--
-- This migration is read-side only:
--   * no capture triggers, dispatcher cron, realtime publication, or feature flag;
--   * no buyer/product/brand/category/warehouse daily facts;
--   * no stored action membership, ranked JSON, arrays, or top-list tables.

CREATE INDEX IF NOT EXISTS estimates_metrics_tenant_status_day_idx
  ON app.estimates (tenant_id, status, app.metric_day_ist(estimate_date, created_at), id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_metrics_tenant_status_day_idx
  ON app.orders (tenant_id, status, app.metric_day_ist(order_date, created_at), id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS invoices_metrics_tenant_status_day_idx
  ON app.invoices (tenant_id, status, app.metric_day_ist(invoice_date, created_at), id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS invoices_metrics_tenant_due_idx
  ON app.invoices (tenant_id, due_date, id)
  WHERE deleted_at IS NULL AND outstanding_balance > 0;

CREATE INDEX IF NOT EXISTS buyers_metrics_tenant_name_idx
  ON app.buyers (tenant_id, business_name, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS metrics_buyer_location_snapshot_tenant_buyer_idx
  ON app.metrics_buyer_location_snapshot (tenant_id, buyer_id, location_id)
  WHERE deleted_at IS NULL;

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
        'open_total', v_open_count
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

REVOKE ALL ON FUNCTION app.metrics_v2_transaction_landing(uuid, text, uuid[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.metrics_v2_transaction_landing(uuid, text, uuid[], timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.metrics_v2_products_landing(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_brand_names text[] DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_stock text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
  v_location_scoped boolean := COALESCE(array_length(p_location_ids, 1), 0) > 0;
  v_total bigint := 0;
  v_next_created_at timestamptz;
  v_next_id uuid;
  v_next_cursor jsonb := NULL;
  v_products jsonb := '[]'::jsonb;
  v_brands jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_active_skus bigint := 0;
  v_total_skus bigint := 0;
  v_archived_skus bigint := 0;
  v_out_of_stock bigint := 0;
  v_low_stock bigint := 0;
  v_units numeric := 0;
  v_revenue numeric := 0;
  v_previous_revenue numeric := 0;
  v_needs_attention jsonb := '[]'::jsonb;
  v_top_performers jsonb := '[]'::jsonb;
  v_top_risers jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'metrics_v2_products_landing_tenant_required' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE _metrics_v2_products_base ON COMMIT DROP AS
  SELECT
    tp.id,
    tp.tenant_id,
    tp.tenant_brand_id,
    tp.tenant_category_id,
    tp.master_product_id,
    tp.internal_sku,
    tp.name_override,
    tp.mrp,
    tp.base_selling_price,
    tp.cost_price,
    tp.default_uom,
    tp.pack_size,
    tp.image_urls,
    tp.is_active,
    tp.external_ref,
    tp.created_at,
    tp.updated_at,
    COALESCE(NULLIF(tp.name_override, ''), tp.internal_sku) AS display_name,
    COALESCE(NULLIF(tb.display_name_override, ''), NULLIF(mb.name, ''), 'Unknown brand') AS brand_name,
    COALESCE(NULLIF(tc.name, ''), 'Uncategorized') AS category_name,
    COALESCE(mps.on_hand, 0)::numeric AS on_hand,
    COALESCE(mps.available, COALESCE(mps.on_hand, 0))::numeric AS available,
    COALESCE(mps.invoice_units_90d, 0)::numeric AS units_90d,
    COALESCE(mps.invoice_value_90d, 0)::numeric AS revenue_90d,
    0::numeric AS previous_revenue_90d,
    mps.days_cover,
    COALESCE(mps.low_stock, false) AS low_stock,
    COALESCE(mps.out_of_stock, false) AS out_of_stock,
    mps.source_watermark,
    mps.computed_at
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_brands tb
    ON tb.id = tp.tenant_brand_id
   AND tb.tenant_id = tp.tenant_id
   AND tb.deleted_at IS NULL
  LEFT JOIN catalog.brands mb
    ON mb.id = tb.master_brand_id
   AND mb.deleted_at IS NULL
  LEFT JOIN app.tenant_categories tc
    ON tc.id = tp.tenant_category_id
   AND tc.tenant_id = tp.tenant_id
   AND tc.deleted_at IS NULL
  LEFT JOIN app.metrics_product_snapshot mps
    ON mps.tenant_id = tp.tenant_id
   AND mps.tenant_product_id = tp.id
   AND mps.deleted_at IS NULL
  WHERE tp.tenant_id = p_tenant_id
    AND tp.deleted_at IS NULL
    AND (
      NOT v_location_scoped
      OR EXISTS (
        SELECT 1
        FROM app.metrics_product_location_snapshot mpl
        WHERE mpl.tenant_id = tp.tenant_id
          AND mpl.tenant_product_id = tp.id
          AND mpl.location_id = ANY (p_location_ids)
          AND mpl.deleted_at IS NULL
      )
    );

  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_active)::bigint,
    COUNT(*) FILTER (WHERE NOT is_active)::bigint,
    COUNT(*) FILTER (WHERE out_of_stock)::bigint,
    COUNT(*) FILTER (WHERE low_stock AND NOT out_of_stock)::bigint,
    COALESCE(SUM(units_90d), 0),
    COALESCE(SUM(revenue_90d), 0),
    COALESCE(SUM(previous_revenue_90d), 0)
  INTO v_total_skus, v_active_skus, v_archived_skus, v_out_of_stock, v_low_stock, v_units, v_revenue, v_previous_revenue
  FROM _metrics_v2_products_base;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('value', brand_name, 'label', brand_name) ORDER BY brand_name), '[]'::jsonb)
  INTO v_brands
  FROM (
    SELECT DISTINCT brand_name
    FROM _metrics_v2_products_base
    WHERE is_active AND brand_name IS NOT NULL
  ) b;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('value', category_name, 'label', category_name) ORDER BY category_name), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT DISTINCT category_name
    FROM _metrics_v2_products_base
    WHERE is_active AND category_name IS NOT NULL
  ) c;

  DELETE FROM _metrics_v2_products_base
  WHERE (p_query IS NOT NULL AND p_query <> '' AND (
      display_name NOT ILIKE '%' || p_query || '%'
      AND internal_sku NOT ILIKE '%' || p_query || '%'
      AND brand_name NOT ILIKE '%' || p_query || '%'
      AND category_name NOT ILIKE '%' || p_query || '%'
    ))
    OR (COALESCE(array_length(p_brand_names, 1), 0) > 0 AND brand_name <> ALL (p_brand_names))
    OR (COALESCE(array_length(p_category_names, 1), 0) > 0 AND category_name <> ALL (p_category_names))
    OR (COALESCE(array_length(p_statuses, 1), 0) > 0 AND NOT (
      ('Active' = ANY (p_statuses) AND is_active)
      OR ('Inactive' = ANY (p_statuses) AND NOT is_active)
    ))
    OR (COALESCE(array_length(p_stock, 1), 0) > 0 AND NOT (
      ('Out of stock' = ANY (p_stock) AND out_of_stock)
      OR ('Low stock' = ANY (p_stock) AND low_stock AND NOT out_of_stock)
      OR ('In stock' = ANY (p_stock) AND NOT out_of_stock AND NOT low_stock)
    ))
    OR (
      p_cursor_created_at IS NOT NULL
      AND p_cursor_id IS NOT NULL
      AND NOT (created_at < p_cursor_created_at OR (created_at = p_cursor_created_at AND id < p_cursor_id))
    );

  SELECT COUNT(*) INTO v_total FROM _metrics_v2_products_base;

  WITH page_rows AS (
    SELECT *
    FROM _metrics_v2_products_base
    ORDER BY created_at DESC, id DESC
    LIMIT v_limit + 1
  ),
  visible_rows AS (
    SELECT *
    FROM page_rows
    ORDER BY created_at DESC, id DESC
    LIMIT v_limit
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'tenant_id', tenant_id,
      'tenant_brand_id', tenant_brand_id,
      'tenant_category_id', tenant_category_id,
      'master_product_id', master_product_id,
      'internal_sku', internal_sku,
      'name_override', name_override,
      'mrp', mrp,
      'base_selling_price', base_selling_price,
      'cost_price', cost_price,
      'default_uom', default_uom,
      'pack_size', pack_size,
      'image_urls', image_urls,
      'is_active', is_active,
      'external_ref', external_ref,
      'created_at', created_at,
      'updated_at', updated_at,
      'master_product', NULL,
      'display_name', display_name,
      'brand_name', brand_name,
      'category_name', category_name,
      'on_hand', on_hand,
      'days_cover', days_cover,
      'units_mtd', units_90d,
      'gmv_mtd', revenue_90d,
      'growth_pct', CASE WHEN previous_revenue_90d > 0 THEN ROUND(((revenue_90d - previous_revenue_90d) / previous_revenue_90d) * 100) WHEN revenue_90d > 0 THEN 100 ELSE 0 END,
      'status_label', CASE WHEN out_of_stock THEN 'Out of stock' WHEN low_stock THEN 'Low stock' WHEN days_cover IS NULL THEN 'Insufficient velocity' ELSE 'On pace' END,
      'status_tone', CASE WHEN out_of_stock THEN 'danger' WHEN low_stock THEN 'warning' WHEN days_cover IS NULL THEN 'neutral' ELSE 'success' END
    ) ORDER BY created_at DESC, id DESC), '[]'::jsonb)
  INTO v_products
  FROM visible_rows;

  SELECT pr.created_at, pr.id
  INTO v_next_created_at, v_next_id
  FROM (
    SELECT created_at, id, row_number() OVER (ORDER BY created_at DESC, id DESC) AS rn
    FROM _metrics_v2_products_base
  ) pr
  WHERE pr.rn = v_limit;

  IF v_total > v_limit AND v_next_created_at IS NOT NULL AND v_next_id IS NOT NULL THEN
    v_next_cursor := jsonb_build_object('t', v_next_created_at, 'i', v_next_id);
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_needs_attention
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'name', display_name,
        'brand', brand_name,
        'brand_initials', upper(left(regexp_replace(brand_name, '[^[:alnum:]]', '', 'g'), 2)),
        'brand_hue', CASE (row_number() OVER (ORDER BY out_of_stock DESC, low_stock DESC, revenue_90d DESC, id) - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END,
        'on_hand', on_hand,
        'days_cover', days_cover,
        'growth_pct', CASE WHEN previous_revenue_90d > 0 THEN ROUND(((revenue_90d - previous_revenue_90d) / previous_revenue_90d) * 100) WHEN revenue_90d > 0 THEN 100 ELSE 0 END,
        'units_mtd', units_90d,
        'gmv_mtd', revenue_90d,
        'status', jsonb_build_object(
          'label', CASE WHEN out_of_stock THEN 'Out of stock' WHEN low_stock THEN 'Low stock' WHEN days_cover IS NULL THEN 'Insufficient velocity' ELSE 'On pace' END,
          'tone', CASE WHEN out_of_stock THEN 'danger' WHEN low_stock THEN 'warning' WHEN days_cover IS NULL THEN 'neutral' ELSE 'success' END
        )
      ) AS item
    FROM _metrics_v2_products_base
    WHERE out_of_stock OR low_stock
    ORDER BY out_of_stock DESC, low_stock DESC, revenue_90d DESC, id
    LIMIT 3
  ) s;

  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_top_performers
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'name', display_name,
        'brand', brand_name,
        'brand_initials', upper(left(regexp_replace(brand_name, '[^[:alnum:]]', '', 'g'), 2)),
        'brand_hue', CASE (row_number() OVER (ORDER BY revenue_90d DESC, id) - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END,
        'on_hand', on_hand,
        'days_cover', days_cover,
        'growth_pct', CASE WHEN previous_revenue_90d > 0 THEN ROUND(((revenue_90d - previous_revenue_90d) / previous_revenue_90d) * 100) WHEN revenue_90d > 0 THEN 100 ELSE 0 END,
        'units_mtd', units_90d,
        'gmv_mtd', revenue_90d,
        'status', jsonb_build_object(
          'label', CASE WHEN out_of_stock THEN 'Out of stock' WHEN low_stock THEN 'Low stock' WHEN days_cover IS NULL THEN 'Insufficient velocity' ELSE 'On pace' END,
          'tone', CASE WHEN out_of_stock THEN 'danger' WHEN low_stock THEN 'warning' WHEN days_cover IS NULL THEN 'neutral' ELSE 'success' END
        )
      ) AS item
    FROM _metrics_v2_products_base
    ORDER BY revenue_90d DESC, id
    LIMIT 3
  ) s;

  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_top_risers
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'name', display_name,
        'brand', brand_name,
        'brand_initials', upper(left(regexp_replace(brand_name, '[^[:alnum:]]', '', 'g'), 2)),
        'brand_hue', CASE (row_number() OVER (ORDER BY (revenue_90d - previous_revenue_90d) DESC, id) - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END,
        'on_hand', on_hand,
        'days_cover', days_cover,
        'growth_pct', CASE WHEN previous_revenue_90d > 0 THEN ROUND(((revenue_90d - previous_revenue_90d) / previous_revenue_90d) * 100) WHEN revenue_90d > 0 THEN 100 ELSE 0 END,
        'units_mtd', units_90d,
        'gmv_mtd', revenue_90d,
        'status', jsonb_build_object(
          'label', CASE WHEN out_of_stock THEN 'Out of stock' WHEN low_stock THEN 'Low stock' WHEN days_cover IS NULL THEN 'Insufficient velocity' ELSE 'On pace' END,
          'tone', CASE WHEN out_of_stock THEN 'danger' WHEN low_stock THEN 'warning' WHEN days_cover IS NULL THEN 'neutral' ELSE 'success' END
        )
      ) AS item
    FROM _metrics_v2_products_base
    WHERE revenue_90d > previous_revenue_90d
    ORDER BY (revenue_90d - previous_revenue_90d) DESC, id
    LIMIT 3
  ) s;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'table_period_owner', 'none',
    'headline_period', 'trailing_90_days',
    'action_period', 'now',
    'commercial_horizon_days', 90,
    'kpis', jsonb_build_object(
      'active_skus', v_active_skus,
      'total_skus', v_total_skus,
      'archived_skus', v_archived_skus,
      'out_of_stock', v_out_of_stock,
      'low_stock', v_low_stock,
      'units_mtd', v_units,
      'revenue_mtd', v_revenue,
      'revenue_prev_mtd', v_previous_revenue,
      'revenue_growth_pct', CASE WHEN v_previous_revenue > 0 THEN ROUND(((v_revenue - v_previous_revenue) / v_previous_revenue) * 100) WHEN v_revenue > 0 THEN 100 ELSE 0 END
    ),
    'todays_read', jsonb_build_object(
      'needs_attention', v_needs_attention,
      'top_performers', v_top_performers,
      'top_risers', v_top_risers
    ),
    'filters', jsonb_build_object(
      'groups', jsonb_build_array(
        jsonb_build_object('key', 'brand', 'label', 'Brand', 'options', v_brands),
        jsonb_build_object('key', 'category', 'label', 'Category', 'options', v_categories),
        jsonb_build_object('key', 'status', 'label', 'Status', 'options', jsonb_build_array(
          jsonb_build_object('value', 'Active', 'label', 'Active'),
          jsonb_build_object('value', 'Inactive', 'label', 'Inactive')
        )),
        jsonb_build_object('key', 'stock', 'label', 'Stock', 'options', jsonb_build_array(
          jsonb_build_object('value', 'In stock', 'label', 'In stock'),
          jsonb_build_object('value', 'Low stock', 'label', 'Low stock'),
          jsonb_build_object('value', 'Out of stock', 'label', 'Out of stock')
        ))
      )
    ),
    'products', v_products,
    'brands', (SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) FROM jsonb_array_elements(v_brands) AS option(value)),
    'total', v_total,
    'nextCursor', v_next_cursor
  );
END;
$$;

REVOKE ALL ON FUNCTION app.metrics_v2_products_landing(uuid, uuid[], text, text[], text[], text[], text[], integer, timestamptz, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.metrics_v2_products_landing(uuid, uuid[], text, text[], text[], text[], text[], integer, timestamptz, uuid, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.metrics_v2_customers_landing(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_dues text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_name text DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
  v_location_scoped boolean := COALESCE(array_length(p_location_ids, 1), 0) > 0;
  v_total bigint := 0;
  v_active bigint := 0;
  v_dormant bigint := 0;
  v_dues_buyers bigint := 0;
  v_cohort_count bigint := 0;
  v_spend numeric := 0;
  v_prev_spend numeric := 0;
  v_outstanding numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  v_needs_call jsonb := '[]'::jsonb;
  v_top_spenders jsonb := '[]'::jsonb;
  v_top_risers jsonb := '[]'::jsonb;
  v_next_name text;
  v_next_id uuid;
  v_next_cursor jsonb := NULL;
  v_source_watermark timestamptz;
  v_computed_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'metrics_v2_customers_landing_tenant_required' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE _metrics_v2_customers_base ON COMMIT DROP AS
  WITH scoped_metrics AS (
    SELECT
      b.id AS buyer_id,
      COALESCE(SUM(bls.invoice_count_90d), 0)::bigint AS invoice_count_90d,
      COALESCE(SUM(bls.invoice_value_90d), 0)::numeric AS invoice_value_90d,
      0::numeric AS prior_year_invoice_value_90d,
      COALESCE(SUM(bls.estimate_count_90d), 0)::bigint AS estimate_count_90d,
      COALESCE(SUM(bls.order_count_90d), 0)::bigint AS order_count_90d,
      COALESCE(SUM(bls.order_value_90d), 0)::numeric AS order_value_90d,
      MAX(bls.last_invoice_at) AS last_invoice_at,
      MAX(bls.last_estimate_at) AS last_estimate_at,
      MAX(bls.last_order_at) AS last_order_at,
      COALESCE(SUM(bls.receivable_amount), 0)::numeric AS receivable_amount,
      COALESCE(SUM(bls.overdue_amount), 0)::numeric AS overdue_amount,
      MAX(bls.source_watermark) AS source_watermark,
      MAX(bls.computed_at) AS computed_at
    FROM app.buyers b
    LEFT JOIN app.metrics_buyer_location_snapshot bls
      ON bls.tenant_id = b.tenant_id
     AND bls.buyer_id = b.id
     AND bls.location_id = ANY (p_location_ids)
     AND bls.deleted_at IS NULL
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND v_location_scoped
    GROUP BY b.id
  ),
  tenant_metrics AS (
    SELECT
      bs.buyer_id,
      bs.invoice_count_90d,
      bs.invoice_value_90d,
      bs.prior_year_invoice_value_90d,
      bs.estimate_count_90d,
      bs.order_count_90d,
      bs.order_value_90d,
      bs.last_invoice_at,
      bs.last_estimate_at,
      bs.last_order_at,
      bs.receivable_amount,
      bs.overdue_amount,
      bs.source_watermark,
      bs.computed_at
    FROM app.metrics_buyer_snapshot bs
    WHERE bs.tenant_id = p_tenant_id
      AND bs.deleted_at IS NULL
      AND NOT v_location_scoped
  ),
  metrics AS (
    SELECT * FROM scoped_metrics
    UNION ALL
    SELECT * FROM tenant_metrics
  )
  SELECT
    b.id,
    b.business_name,
    b.tier,
    b.phone,
    b.gst_treatment,
    b.status AS zoho_status,
    b.credit_limit AS buyer_credit_limit,
    b.is_active,
    b.geography,
    b.whatsapp_opt_out_at,
    COALESCE(m.invoice_count_90d, 0)::bigint AS invoice_count_90d,
    COALESCE(m.invoice_value_90d, 0)::numeric AS invoice_value_90d,
    COALESCE(m.prior_year_invoice_value_90d, 0)::numeric AS prior_year_invoice_value_90d,
    COALESCE(m.estimate_count_90d, 0)::bigint AS estimate_count_90d,
    COALESCE(m.order_count_90d, 0)::bigint AS order_count_90d,
    COALESCE(m.order_value_90d, 0)::numeric AS order_value_90d,
    GREATEST(m.last_invoice_at, m.last_estimate_at, m.last_order_at) AS last_order_at,
    COALESCE(m.receivable_amount, 0)::numeric AS receivable_amount,
    COALESCE(m.overdue_amount, 0)::numeric AS overdue_amount,
    COALESCE(bs.credit_limit, b.credit_limit, 0)::numeric AS credit_limit,
    bs.last_buyer_app_activity_at,
    bs.health_reason,
    COALESCE(m.source_watermark, bs.source_watermark) AS source_watermark,
    COALESCE(m.computed_at, bs.computed_at) AS computed_at
  FROM app.buyers b
  LEFT JOIN metrics m ON m.buyer_id = b.id
  LEFT JOIN app.metrics_buyer_snapshot bs
    ON bs.tenant_id = b.tenant_id
   AND bs.buyer_id = b.id
   AND bs.deleted_at IS NULL
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND (NOT v_location_scoped OR m.buyer_id IS NOT NULL);

  CREATE TEMP TABLE _metrics_v2_customer_cohorts ON COMMIT DROP AS
  SELECT
    cm.buyer_id,
    MIN(c.name) AS cohort_name,
    COUNT(DISTINCT c.id)::bigint AS cohort_count
  FROM app.cohort_members cm
  JOIN app.cohorts c
    ON c.id = cm.cohort_id
   AND c.tenant_id = p_tenant_id
   AND c.deleted_at IS NULL
  JOIN _metrics_v2_customers_base b ON b.id = cm.buyer_id
  GROUP BY cm.buyer_id;

  CREATE TEMP TABLE _metrics_v2_customer_price_lists ON COMMIT DROP AS
  WITH candidate AS (
    SELECT
      pla.target_id AS buyer_id,
      pl.name,
      'direct'::text AS source,
      NULL::text AS cohort_name,
      pl.priority,
      pla.created_at,
      0 AS source_rank
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id AND pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL
    JOIN _metrics_v2_customers_base b ON b.id = pla.target_id
    WHERE pla.deleted_at IS NULL AND pla.target_type = 'buyer'
    UNION ALL
    SELECT
      cm.buyer_id,
      pl.name,
      'cohort'::text AS source,
      c.name AS cohort_name,
      pl.priority,
      pla.created_at,
      1 AS source_rank
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id AND pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL
    JOIN app.cohorts c ON c.id = pla.target_id AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    JOIN app.cohort_members cm ON cm.cohort_id = c.id
    JOIN _metrics_v2_customers_base b ON b.id = cm.buyer_id
    WHERE pla.deleted_at IS NULL AND pla.target_type = 'cohort'
  )
  SELECT buyer_id, name, source, cohort_name
  FROM (
    SELECT *, row_number() OVER (PARTITION BY buyer_id ORDER BY source_rank, priority DESC, created_at DESC NULLS LAST) AS rn
    FROM candidate
  ) ranked
  WHERE rn = 1;

  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) > 0)::bigint,
    COUNT(*) FILTER (WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0)::bigint,
    COUNT(*) FILTER (WHERE receivable_amount > 0)::bigint,
    COALESCE(SUM(invoice_value_90d), 0),
    COALESCE(SUM(prior_year_invoice_value_90d), 0),
    COALESCE(SUM(receivable_amount), 0),
    MAX(source_watermark),
    MAX(computed_at)
  INTO v_total, v_active, v_dormant, v_dues_buyers, v_spend, v_prev_spend, v_outstanding, v_source_watermark, v_computed_at
  FROM _metrics_v2_customers_base;

  SELECT COUNT(DISTINCT cohort_name)::bigint INTO v_cohort_count FROM _metrics_v2_customer_cohorts;

  DELETE FROM _metrics_v2_customers_base
  WHERE (p_query IS NOT NULL AND p_query <> '' AND (
      business_name NOT ILIKE '%' || p_query || '%'
      AND COALESCE(phone, '') NOT ILIKE '%' || p_query || '%'
      AND COALESCE(geography->>'city', '') NOT ILIKE '%' || p_query || '%'
      AND COALESCE(geography->>'state', '') NOT ILIKE '%' || p_query || '%'
    ))
    OR (COALESCE(array_length(p_statuses, 1), 0) > 0 AND NOT (
      ('Active' = ANY (p_statuses) AND is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) > 0)
      OR ('Inactive' = ANY (p_statuses) AND NOT is_active)
      OR ('Dormant' = ANY (p_statuses) AND is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0)
    ))
    OR (COALESCE(array_length(p_dues, 1), 0) > 0 AND NOT (
      ('Due' = ANY (p_dues) AND receivable_amount > 0)
      OR ('Overdue' = ANY (p_dues) AND overdue_amount > 0)
    ))
    OR (
      p_cursor_name IS NOT NULL
      AND p_cursor_id IS NOT NULL
      AND NOT (business_name > p_cursor_name OR (business_name = p_cursor_name AND id > p_cursor_id))
    );

  SELECT COUNT(*) INTO v_total FROM _metrics_v2_customers_base;

  WITH page_rows AS (
    SELECT * FROM _metrics_v2_customers_base ORDER BY business_name ASC, id ASC LIMIT v_limit + 1
  ),
  visible_rows AS (
    SELECT * FROM page_rows ORDER BY business_name ASC, id ASC LIMIT v_limit
  ),
  numbered_rows AS (
    SELECT r.*, row_number() OVER (ORDER BY r.business_name ASC, r.id ASC) AS row_ordinal
    FROM visible_rows r
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'business_name', r.business_name,
    'tier', r.tier,
    'phone', r.phone,
    'gst_treatment', r.gst_treatment,
    'zoho_status', r.zoho_status,
    'is_active', r.is_active,
    'city', COALESCE(r.geography->>'city', 'Unknown'),
    'state', r.geography->>'state',
    'cohort', COALESCE(c.cohort_name, '—'),
    'spend_mtd', r.invoice_value_90d,
    'spend_prev_mtd', r.prior_year_invoice_value_90d,
    'growth_pct', CASE WHEN r.prior_year_invoice_value_90d > 0 THEN ROUND(((r.invoice_value_90d - r.prior_year_invoice_value_90d) / r.prior_year_invoice_value_90d) * 100, 1) WHEN r.invoice_value_90d > 0 THEN 100 ELSE 0 END,
    'orders_mtd', r.order_count_90d,
    'last_order_at', r.last_order_at,
    'credit_limit', r.credit_limit,
    'credit_used', r.receivable_amount,
    'dues', r.receivable_amount,
    'status', jsonb_build_object(
      'label', CASE WHEN NOT r.is_active THEN 'Inactive' WHEN r.overdue_amount > 0 OR r.receivable_amount > r.credit_limit THEN 'Needs follow-up' WHEN (r.invoice_count_90d + r.estimate_count_90d + r.order_count_90d) = 0 THEN 'Dormant' ELSE 'Healthy' END,
      'tone', CASE WHEN NOT r.is_active THEN 'neutral' WHEN r.overdue_amount > 0 OR r.receivable_amount > r.credit_limit THEN 'warning' WHEN (r.invoice_count_90d + r.estimate_count_90d + r.order_count_90d) = 0 THEN 'danger' ELSE 'success' END
    ),
    'avatar', jsonb_build_object(
      'initials', upper(left(regexp_replace(r.business_name, '[^[:alnum:]]', '', 'g'), 2)),
      'hue', CASE (r.row_ordinal - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END
    ),
    'active_price_list', CASE WHEN pl.name IS NULL THEN NULL ELSE jsonb_build_object('name', pl.name, 'source', pl.source, 'cohort_name', pl.cohort_name) END,
    'whatsapp_opted_out', r.whatsapp_opt_out_at IS NOT NULL
  ) ORDER BY r.business_name ASC, r.id ASC), '[]'::jsonb)
  INTO v_rows
  FROM numbered_rows r
  LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = r.id
  LEFT JOIN _metrics_v2_customer_price_lists pl ON pl.buyer_id = r.id;

  SELECT r.business_name, r.id
  INTO v_next_name, v_next_id
  FROM (
    SELECT business_name, id, row_number() OVER (ORDER BY business_name ASC, id ASC) AS rn
    FROM _metrics_v2_customers_base
  ) r
  WHERE r.rn = v_limit;

  IF v_total > v_limit AND v_next_name IS NOT NULL AND v_next_id IS NOT NULL THEN
    v_next_cursor := jsonb_build_object('n', v_next_name, 'i', v_next_id);
  END IF;

  WITH ranked AS (
    SELECT
      b.*,
      COALESCE(c.cohort_name, '—') AS cohort_name,
      CASE WHEN prior_year_invoice_value_90d > 0 THEN ROUND(((invoice_value_90d - prior_year_invoice_value_90d) / prior_year_invoice_value_90d) * 100, 1) WHEN invoice_value_90d > 0 THEN 100 ELSE 0 END AS growth_pct
    FROM _metrics_v2_customers_base b
    LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = b.id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_needs_call
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'business_name', business_name,
        'tier', tier,
        'phone', phone,
        'city', COALESCE(geography->>'city', 'Unknown'),
        'state', geography->>'state',
        'cohort', cohort_name,
        'spend_mtd', invoice_value_90d,
        'spend_prev_mtd', prior_year_invoice_value_90d,
        'growth_pct', growth_pct,
        'orders_mtd', order_count_90d,
        'last_order_at', last_order_at,
        'last_order_label', CASE WHEN last_order_at IS NULL THEN 'Never' ELSE to_char(last_order_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') END,
        'credit_limit', credit_limit,
        'credit_used', receivable_amount,
        'dues', receivable_amount,
        'status', jsonb_build_object('label', 'Needs follow-up', 'tone', 'warning'),
        'avatar', jsonb_build_object('initials', upper(left(regexp_replace(business_name, '[^[:alnum:]]', '', 'g'), 2)), 'hue', 'teal'),
        'active_price_list', NULL,
        'whatsapp_opted_out', whatsapp_opt_out_at IS NOT NULL
      ) AS item
    FROM ranked
    WHERE overdue_amount > 0 OR receivable_amount > credit_limit OR (is_active AND invoice_count_90d + estimate_count_90d + order_count_90d = 0)
    ORDER BY overdue_amount DESC, receivable_amount DESC, business_name ASC
    LIMIT 3
  ) s;

  WITH ranked AS (
    SELECT
      b.*,
      COALESCE(c.cohort_name, '—') AS cohort_name,
      CASE WHEN prior_year_invoice_value_90d > 0 THEN ROUND(((invoice_value_90d - prior_year_invoice_value_90d) / prior_year_invoice_value_90d) * 100, 1) WHEN invoice_value_90d > 0 THEN 100 ELSE 0 END AS growth_pct
    FROM _metrics_v2_customers_base b
    LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = b.id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_top_spenders
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'business_name', business_name,
        'tier', tier,
        'phone', phone,
        'city', COALESCE(geography->>'city', 'Unknown'),
        'state', geography->>'state',
        'cohort', cohort_name,
        'spend_mtd', invoice_value_90d,
        'spend_prev_mtd', prior_year_invoice_value_90d,
        'growth_pct', growth_pct,
        'orders_mtd', order_count_90d,
        'last_order_at', last_order_at,
        'credit_limit', credit_limit,
        'credit_used', receivable_amount,
        'dues', receivable_amount,
        'status', jsonb_build_object('label', 'Healthy', 'tone', 'success'),
        'avatar', jsonb_build_object('initials', upper(left(regexp_replace(business_name, '[^[:alnum:]]', '', 'g'), 2)), 'hue', 'ember'),
        'active_price_list', NULL,
        'whatsapp_opted_out', whatsapp_opt_out_at IS NOT NULL
      ) AS item
    FROM ranked
    ORDER BY invoice_value_90d DESC, business_name ASC
    LIMIT 3
  ) s;

  WITH ranked AS (
    SELECT
      b.*,
      COALESCE(c.cohort_name, '—') AS cohort_name,
      CASE WHEN prior_year_invoice_value_90d > 0 THEN ROUND(((invoice_value_90d - prior_year_invoice_value_90d) / prior_year_invoice_value_90d) * 100, 1) WHEN invoice_value_90d > 0 THEN 100 ELSE 0 END AS growth_pct
    FROM _metrics_v2_customers_base b
    LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = b.id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_top_risers
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'business_name', business_name,
        'tier', tier,
        'phone', phone,
        'city', COALESCE(geography->>'city', 'Unknown'),
        'state', geography->>'state',
        'cohort', cohort_name,
        'spend_mtd', invoice_value_90d,
        'spend_prev_mtd', prior_year_invoice_value_90d,
        'growth_pct', growth_pct,
        'orders_mtd', order_count_90d,
        'last_order_at', last_order_at,
        'credit_limit', credit_limit,
        'credit_used', receivable_amount,
        'dues', receivable_amount,
        'status', jsonb_build_object('label', 'Healthy', 'tone', 'success'),
        'avatar', jsonb_build_object('initials', upper(left(regexp_replace(business_name, '[^[:alnum:]]', '', 'g'), 2)), 'hue', 'cream'),
        'active_price_list', NULL,
        'whatsapp_opted_out', whatsapp_opt_out_at IS NOT NULL
      ) AS item
    FROM ranked
    WHERE growth_pct > 0
    ORDER BY growth_pct DESC, invoice_value_90d DESC, business_name ASC
    LIMIT 3
  ) s;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'table_period_owner', 'none',
    'headline_period', 'trailing_90_days',
    'action_period', 'now',
    'commercial_horizon_days', 90,
    'source_watermark', v_source_watermark,
    'computed_at', v_computed_at,
    'period', jsonb_build_object(
      'selected', 'last90',
      'label', 'Trailing 90 days',
      'current_label', 'Trailing 90 days',
      'previous_label', 'prior-year trailing 90 days'
    ),
    'kpis', jsonb_build_object(
      'total', v_total,
      'cohort_count', COALESCE(v_cohort_count, 0),
      'active', v_active,
      'active_pct', CASE WHEN v_total > 0 THEN ROUND((v_active::numeric / v_total::numeric) * 100, 1) ELSE 0 END,
      'spend_mtd', v_spend,
      'spend_growth_pct', CASE WHEN v_prev_spend > 0 THEN ROUND(((v_spend - v_prev_spend) / v_prev_spend) * 100, 1) WHEN v_spend > 0 THEN 100 ELSE 0 END,
      'dormant_over_30d', v_dormant,
      'outstanding_dues', v_outstanding,
      'buyers_with_dues', v_dues_buyers
    ),
    'callouts', jsonb_build_object(
      'needs_call', v_needs_call,
      'top_spenders', v_top_spenders,
      'top_risers', v_top_risers
    ),
    'buyers', v_rows,
    'filters', jsonb_build_object(
      'groups', jsonb_build_array(
        jsonb_build_object('key', 'status', 'label', 'Status', 'options', jsonb_build_array(
          jsonb_build_object('value', 'Active', 'label', 'Active'),
          jsonb_build_object('value', 'Inactive', 'label', 'Inactive'),
          jsonb_build_object('value', 'Dormant', 'label', 'Dormant')
        )),
        jsonb_build_object('key', 'due', 'label', 'Due', 'options', jsonb_build_array(
          jsonb_build_object('value', 'Due', 'label', 'Due'),
          jsonb_build_object('value', 'Overdue', 'label', 'Overdue')
        ))
      )
    ),
    'total', v_total,
    'nextCursor', v_next_cursor
  );
END;
$$;

REVOKE ALL ON FUNCTION app.metrics_v2_customers_landing(uuid, uuid[], text, text[], text[], integer, text, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.metrics_v2_customers_landing(uuid, uuid[], text, text[], text[], integer, text, uuid, timestamptz) TO authenticated, service_role;
