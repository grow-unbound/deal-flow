-- Expand landing callout payloads so V3CalloutPanel previews 2 rows but side sheets can render the full list across seller landings.

-- Estimates / Invoices / Sales Orders were already resolved separately; this migration covers the remaining RPC-backed pages.

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
  v_recently_sold_out_of_stock bigint := 0;
  v_products_sold bigint := 0;
  v_units numeric := 0;
  v_revenue numeric := 0;
  v_previous_revenue numeric := 0;
  v_recently_sold_oos_action jsonb := '[]'::jsonb;
  v_running_low_action jsonb := '[]'::jsonb;
  v_no_sale_action jsonb := '[]'::jsonb;
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
    mps.no_sale_since,
    COALESCE(mps.purchasing_buyers_90d, 0)::bigint AS purchasing_buyers_90d,
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
    COUNT(*) FILTER (WHERE out_of_stock AND units_90d > 0)::bigint,
    COUNT(*) FILTER (WHERE units_90d > 0)::bigint,
    COALESCE(SUM(units_90d), 0),
    COALESCE(SUM(revenue_90d), 0),
    COALESCE(SUM(previous_revenue_90d), 0)
  INTO v_total_skus, v_active_skus, v_archived_skus, v_out_of_stock, v_low_stock,
    v_recently_sold_out_of_stock, v_products_sold, v_units, v_revenue, v_previous_revenue
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

  -- Actions are NOW (current stock posture), not scoped to the table's
  -- filters/search — compute from the full base before the DELETE below.
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_recently_sold_oos_action
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'name', display_name,
        'sku', internal_sku,
        'brand', brand_name,
        'brand_initials', upper(left(regexp_replace(brand_name, '[^[:alnum:]]', '', 'g'), 2)),
        'brand_hue', CASE (row_number() OVER (ORDER BY revenue_90d DESC, id) - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END,
        'on_hand', on_hand,
        'days_cover', days_cover,
        'units_mtd', units_90d,
        'gmv_mtd', revenue_90d,
        'status', jsonb_build_object('label', 'Out of stock', 'tone', 'danger')
      ) AS item
    FROM _metrics_v2_products_base
    WHERE out_of_stock AND units_90d > 0
    ORDER BY revenue_90d DESC, id

  ) s;

  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_running_low_action
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'name', display_name,
        'sku', internal_sku,
        'brand', brand_name,
        'brand_initials', upper(left(regexp_replace(brand_name, '[^[:alnum:]]', '', 'g'), 2)),
        'brand_hue', CASE (row_number() OVER (ORDER BY days_cover ASC NULLS LAST, id) - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END,
        'on_hand', on_hand,
        'days_cover', days_cover,
        'units_mtd', units_90d,
        'gmv_mtd', revenue_90d,
        'status', jsonb_build_object('label', 'Low stock', 'tone', 'warning')
      ) AS item
    FROM _metrics_v2_products_base
    WHERE low_stock AND NOT out_of_stock AND units_90d > 0
    ORDER BY days_cover ASC NULLS LAST, id

  ) s;

  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_no_sale_action
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'name', display_name,
        'sku', internal_sku,
        'brand', brand_name,
        'brand_initials', upper(left(regexp_replace(brand_name, '[^[:alnum:]]', '', 'g'), 2)),
        'brand_hue', CASE (row_number() OVER (ORDER BY available DESC, id) - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END,
        'on_hand', on_hand,
        'days_cover', days_cover,
        'units_mtd', units_90d,
        'gmv_mtd', revenue_90d,
        'status', jsonb_build_object('label', 'No sale in 90 days', 'tone', 'neutral')
      ) AS item
    FROM _metrics_v2_products_base
    WHERE available > 0 AND units_90d = 0
    ORDER BY available DESC, id

  ) s;

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
      'recently_sold_out_of_stock', v_recently_sold_out_of_stock,
      'products_sold', v_products_sold,
      'units_mtd', v_units,
      'revenue_mtd', v_revenue,
      'revenue_prev_mtd', v_previous_revenue,
      'revenue_growth_pct', CASE WHEN v_previous_revenue > 0 THEN ROUND(((v_revenue - v_previous_revenue) / v_previous_revenue) * 100) WHEN v_revenue > 0 THEN 100 ELSE 0 END,
      'brand_count', jsonb_array_length(v_brands),
      'category_count', jsonb_array_length(v_categories)
    ),
    'todays_read', jsonb_build_object(
      'recently_sold_out_of_stock', v_recently_sold_oos_action,
      'running_low', v_running_low_action,
      'no_sale_90d', v_no_sale_action
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
  v_invoiced_customers bigint := 0;
  v_overdue_sum numeric := 0;
  v_overdue_customers bigint := 0;
  v_dormant_prior_year_value numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  v_needs_call jsonb := '[]'::jsonb;
  v_win_back jsonb := '[]'::jsonb;
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
    bs.oldest_due_at,
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
    COUNT(*) FILTER (WHERE invoice_count_90d > 0)::bigint,
    COALESCE(SUM(overdue_amount), 0),
    COUNT(*) FILTER (WHERE overdue_amount > 0)::bigint,
    COALESCE(SUM(prior_year_invoice_value_90d) FILTER (WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0), 0),
    MAX(source_watermark),
    MAX(computed_at)
  INTO v_total, v_active, v_dormant, v_dues_buyers, v_spend, v_prev_spend, v_outstanding,
    v_invoiced_customers, v_overdue_sum, v_overdue_customers, v_dormant_prior_year_value,
    v_source_watermark, v_computed_at
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
    'overdue_amount', r.overdue_amount,
    'dues', r.receivable_amount,
    'overdue_days', CASE WHEN r.oldest_due_at IS NOT NULL AND r.overdue_amount > 0 THEN GREATEST(0, EXTRACT(DAY FROM (p_as_of - r.oldest_due_at))::int) ELSE NULL END,
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
        'invoice_count', invoice_count_90d,
        'days_overdue', CASE WHEN oldest_due_at IS NOT NULL THEN GREATEST(0, EXTRACT(DAY FROM (p_as_of - oldest_due_at))::int) ELSE NULL END,
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

  ) s;

  WITH ranked AS (
    SELECT
      b.*,
      COALESCE(c.cohort_name, '—') AS cohort_name,
      CASE WHEN last_order_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(DAY FROM (p_as_of - last_order_at))::int) END AS days_inactive
    FROM _metrics_v2_customers_base b
    LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = b.id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_win_back
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
        'prior_value', prior_year_invoice_value_90d,
        'orders_mtd', order_count_90d,
        'last_order_at', last_order_at,
        'last_order_label', CASE WHEN last_order_at IS NULL THEN 'Never' ELSE to_char(last_order_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') END,
        'days_inactive', days_inactive,
        'credit_limit', credit_limit,
        'credit_used', receivable_amount,
        'dues', receivable_amount,
        'status', jsonb_build_object('label', 'Inactive', 'tone', 'neutral'),
        'avatar', jsonb_build_object('initials', upper(left(regexp_replace(business_name, '[^[:alnum:]]', '', 'g'), 2)), 'hue', 'cream'),
        'active_price_list', NULL,
        'whatsapp_opted_out', whatsapp_opt_out_at IS NOT NULL
      ) AS item
    FROM ranked
    WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0
      AND (days_inactive IS NULL OR days_inactive > 90)
    ORDER BY days_inactive DESC NULLS FIRST, prior_year_invoice_value_90d DESC, business_name ASC

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
      'buyers_with_dues', v_dues_buyers,
      'invoiced_customer_count', v_invoiced_customers,
      'overdue_sum', v_overdue_sum,
      'overdue_customer_count', v_overdue_customers,
      'dormant_prior_year_value', v_dormant_prior_year_value
    ),
    'callouts', jsonb_build_object(
      'needs_call', v_needs_call,
      'win_back', v_win_back
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

CREATE OR REPLACE FUNCTION app.get_seller_brand_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end date,
  p_previous_start date,
  p_previous_end date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
  WITH scoped_brands AS MATERIALIZED (
    SELECT tb.id, tb.display_name_override, tb.master_brand_id
    FROM app.tenant_brands tb
    WHERE tb.tenant_id = p_tenant_id
      AND tb.deleted_at IS NULL
      AND tb.is_active = true
  ), brand_products AS MATERIALIZED (
    SELECT tp.id, tp.tenant_brand_id, tp.tenant_category_id
    FROM app.tenant_products tp
    JOIN scoped_brands sb ON sb.id = tp.tenant_brand_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), brand_rollup AS MATERIALIZED (
    SELECT
      bp.tenant_brand_id,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end THEN ii.line_total ELSE 0 END), 0) AS gmv_current,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_previous_end THEN ii.line_total ELSE 0 END), 0) AS gmv_previous,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE i.buyer_id IS NOT NULL
          AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
          AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end
      ) AS buyers_current
    FROM brand_products bp
    LEFT JOIN app.invoice_items ii
      ON ii.tenant_product_id = bp.id
      AND ii.deleted_at IS NULL
    LEFT JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end
      AND (p_location_ids IS NULL OR i.location_id = ANY(p_location_ids))
    GROUP BY bp.tenant_brand_id
  ), low_stock_brands AS MATERIALIZED (
    SELECT bp.tenant_brand_id
    FROM brand_products bp
    JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = bp.id
      AND mps.deleted_at IS NULL
      AND (mps.low_stock OR mps.out_of_stock)
    GROUP BY bp.tenant_brand_id
  ), categories AS MATERIALIZED (
    SELECT ARRAY_REMOVE(ARRAY_AGG(DISTINCT tc.name ORDER BY tc.name), NULL) AS names
    FROM brand_products bp
    LEFT JOIN app.tenant_categories tc
      ON tc.id = bp.tenant_category_id
      AND tc.deleted_at IS NULL
  ), top_performers AS MATERIALIZED (
    SELECT
      sb.id,
      COALESCE(sb.display_name_override, 'Unnamed brand') AS name,
      COALESCE(br.gmv_current, 0) AS gmv_mtd,
      COALESCE(br.buyers_current, 0) AS buyers_count
    FROM scoped_brands sb
    LEFT JOIN brand_rollup br ON br.tenant_brand_id = sb.id
    WHERE COALESCE(br.gmv_current, 0) > 0
    ORDER BY COALESCE(br.gmv_current, 0) DESC, sb.id
  ), top_risers AS MATERIALIZED (
    SELECT
      sb.id,
      COALESCE(sb.display_name_override, 'Unnamed brand') AS name,
      ROUND(
        CASE
          WHEN COALESCE(br.gmv_previous, 0) > 0 THEN ((COALESCE(br.gmv_current, 0) - br.gmv_previous) / br.gmv_previous) * 100
          ELSE 0
        END
      ) AS growth_pct,
      COALESCE(br.gmv_mtd, COALESCE(br.gmv_current, 0)) AS gmv_mtd
    FROM scoped_brands sb
    LEFT JOIN (
      SELECT tenant_brand_id, gmv_current, gmv_previous, gmv_current AS gmv_mtd
      FROM brand_rollup
    ) br ON br.tenant_brand_id = sb.id
    WHERE COALESCE(br.gmv_current, 0) > 0
    ORDER BY growth_pct DESC, gmv_mtd DESC, sb.id
  ), cohorts AS MATERIALIZED (
    SELECT c.id, c.name
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
    ORDER BY c.name
  ), totals AS MATERIALIZED (
    SELECT
      COALESCE(SUM(br.gmv_current), 0) AS portfolio_gmv_mtd,
      COALESCE(SUM(br.gmv_previous), 0) AS portfolio_gmv_prev_mtd,
      COALESCE(SUM(br.buyers_current), 0) AS buyers_with_orders_mtd,
      (SELECT COUNT(*) FROM app.buyers b WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL) AS total_buyers,
      (SELECT COUNT(*) FROM low_stock_brands) AS need_attention_count
    FROM brand_rollup br
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'portfolio_gmv_mtd', totals.portfolio_gmv_mtd,
      'portfolio_gmv_prev_mtd', totals.portfolio_gmv_prev_mtd,
      'brands_carried', COALESCE(ms.active_brand_count, (SELECT COUNT(*) FROM scoped_brands)),
      'buyers_with_orders_mtd', totals.buyers_with_orders_mtd,
      'total_buyers', totals.total_buyers,
      'need_attention_count', totals.need_attention_count,
      'catalog_freshness_count', 0,
      'total_campaigns', COALESCE(ms.active_campaign_count, 0),
      'catalog_freshness_earliest_days', NULL
    ),
    'todays_read', jsonb_build_object(
      'needs_attention', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sb.id, 'name', COALESCE(sb.display_name_override, 'Unnamed brand')) ORDER BY sb.id)
        FROM scoped_brands sb
        JOIN low_stock_brands lb ON lb.tenant_brand_id = sb.id
      ), '[]'::jsonb),
      'top_performers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', tp.id, 'name', tp.name, 'gmv_mtd', tp.gmv_mtd, 'buyers_count', tp.buyers_count) ORDER BY tp.gmv_mtd DESC, tp.id)
        FROM top_performers tp
      ), '[]'::jsonb),
      'top_risers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', tr.id, 'name', tr.name, 'growth_pct', tr.growth_pct, 'gmv_mtd', tr.gmv_mtd) ORDER BY tr.growth_pct DESC, tr.id)
        FROM top_risers tr
      ), '[]'::jsonb)
    ),
    'categories', COALESCE(to_jsonb(categories.names), '[]'::jsonb),
    'cohorts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
      FROM cohorts c
    ), '[]'::jsonb)
  )
  FROM totals
  LEFT JOIN app.metrics_tenant_setup_snapshot ms
    ON ms.tenant_id = p_tenant_id
    AND ms.deleted_at IS NULL
  CROSS JOIN categories;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_category_landing_summary_v2(
  p_tenant_id uuid,
  p_current_start date,
  p_current_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
  WITH active_categories AS MATERIALIZED (
    SELECT tc.id, tc.name
    FROM app.tenant_categories tc
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND tc.is_active = true
  ), products AS MATERIALIZED (
    SELECT tp.id, tp.tenant_category_id, tp.tenant_brand_id
    FROM app.tenant_products tp
    JOIN active_categories ac ON ac.id = tp.tenant_category_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), stock_by_category AS MATERIALIZED (
    SELECT
      p.tenant_category_id AS id,
      COUNT(*) FILTER (WHERE COALESCE(mps.out_of_stock, false)) AS oos_sku_count,
      COUNT(*) FILTER (WHERE COALESCE(mps.low_stock, false) OR COALESCE(mps.out_of_stock, false)) AS low_stock_sku_count
    FROM products p
    LEFT JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = p.id
      AND mps.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  ), invoice_rollup AS MATERIALIZED (
    SELECT
      p.tenant_category_id AS id,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN ii.line_total ELSE 0 END), 0) AS gmv_current,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_previous_end_exclusive THEN ii.line_total ELSE 0 END), 0) AS gmv_previous,
      COALESCE(SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN ii.qty ELSE 0 END), 0)::bigint AS units_current,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE i.buyer_id IS NOT NULL
          AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
          AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
      ) AS buyers_current
    FROM products p
    LEFT JOIN app.invoice_items ii
      ON ii.tenant_product_id = p.id
      AND ii.deleted_at IS NULL
    LEFT JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
    GROUP BY p.tenant_category_id
  ), totals AS MATERIALIZED (
    SELECT
      COALESCE((SELECT SUM(ir.gmv_current) FROM invoice_rollup ir), 0) AS total_gmv,
      COALESCE((
        SELECT ms.active_category_count
        FROM app.metrics_tenant_setup_snapshot ms
        WHERE ms.tenant_id = p_tenant_id
          AND ms.deleted_at IS NULL
      ), 0) AS active_count,
      COALESCE((
        SELECT COUNT(*)
        FROM active_categories ac
        LEFT JOIN invoice_rollup ir ON ir.id = ac.id
        WHERE COALESCE(ir.gmv_current, 0) = 0
      ), 0) AS uncategorized_count
  ), stockout_risk AS MATERIALIZED (
    SELECT
      ac.id,
      ac.name,
      COALESCE(sb.low_stock_sku_count, 0) AS low_stock_sku_count,
      COALESCE(sb.oos_sku_count, 0) AS oos_sku_count
    FROM active_categories ac
    LEFT JOIN stock_by_category sb ON sb.id = ac.id
    WHERE COALESCE(sb.low_stock_sku_count, 0) > 0 OR COALESCE(sb.oos_sku_count, 0) > 0
    ORDER BY COALESCE(sb.oos_sku_count, 0) DESC, COALESCE(sb.low_stock_sku_count, 0) DESC, ac.name

  ), top_performers AS MATERIALIZED (
    SELECT
      ac.id,
      ac.name,
      COALESCE(ir.gmv_current, 0) AS gmv_current,
      COALESCE(ir.buyers_current, 0) AS buyers_current
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    WHERE COALESCE(ir.gmv_current, 0) > 0
    ORDER BY COALESCE(ir.gmv_current, 0) DESC, ac.name

  ), fast_movers AS MATERIALIZED (
    SELECT
      ac.id,
      ac.name,
      COALESCE(ir.units_current, 0) AS units_current,
      COALESCE(ir.gmv_current, 0) AS gmv_current
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    WHERE COALESCE(ir.units_current, 0) > 0
    ORDER BY COALESCE(ir.units_current, 0) DESC, COALESCE(ir.gmv_current, 0) DESC, ac.name

  ), top_category AS MATERIALIZED (
    SELECT ac.name, COALESCE(ir.gmv_current, 0) AS gmv_current
    FROM active_categories ac
    LEFT JOIN invoice_rollup ir ON ir.id = ac.id
    ORDER BY COALESCE(ir.gmv_current, 0) DESC, ac.name
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_count', totals.active_count,
      'low_stock_count', COALESCE((SELECT COUNT(*) FROM stock_by_category sb WHERE COALESCE(sb.low_stock_sku_count, 0) > 0), 0),
      'top_category_name', (SELECT name FROM top_category),
      'top_category_share_pct', CASE WHEN totals.total_gmv > 0 THEN ROUND((COALESCE((SELECT gmv_current FROM top_category), 0) / totals.total_gmv) * 100, 0) ELSE 0 END,
      'uncategorized_count', totals.uncategorized_count
    ),
    'callouts', jsonb_build_object(
      'stockout_risk', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sr.id,
          'name', sr.name,
          'low_stock_sku_count', sr.low_stock_sku_count,
          'oos_sku_count', sr.oos_sku_count
        ) ORDER BY sr.oos_sku_count DESC, sr.low_stock_sku_count DESC, sr.name)
        FROM stockout_risk sr
      ), '[]'::jsonb),
      'top_performers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', tp.id,
          'name', tp.name,
          'gmv_mtd', tp.gmv_current,
          'buyers_count', tp.buyers_current
        ) ORDER BY tp.gmv_current DESC, tp.name)
        FROM top_performers tp
      ), '[]'::jsonb),
      'fast_movers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', fm.id,
          'name', fm.name,
          'units_mtd', fm.units_current,
          'gmv_mtd', fm.gmv_current
        ) ORDER BY fm.units_current DESC, fm.gmv_current DESC, fm.name)
        FROM fast_movers fm
      ), '[]'::jsonb)
    )
  )
  FROM totals;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_cohort_landing_aggregates(
  p_tenant_id uuid,
  p_page_ids uuid[],
  p_current_start timestamptz,
  p_current_end_exclusive timestamptz,
  p_previous_start timestamptz,
  p_previous_end_exclusive timestamptz,
  p_views_by_cohort jsonb DEFAULT '{}'::jsonb,
  p_include_summary boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $function$
  WITH page_ids AS MATERIALIZED (
    SELECT DISTINCT id
    FROM unnest((COALESCE(p_page_ids, ARRAY[]::uuid[]))[1:200]) AS ids(id)
  ),
  cohort_universe AS MATERIALIZED (
    SELECT c.id, c.name, c.created_at, COALESCE(c.cached_member_count, 0) AS cached_member_count
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ),
  target_buyers AS MATERIALIZED (
    SELECT DISTINCT cm.buyer_id
    FROM app.cohort_members cm
    JOIN cohort_universe c ON c.id = cm.cohort_id
    WHERE p_include_summary OR cm.cohort_id IN (SELECT id FROM page_ids)
  ),
  attributed_members AS MATERIALIZED (
    SELECT DISTINCT ON (cm.buyer_id) cm.buyer_id, cm.cohort_id
    FROM app.cohort_members cm
    JOIN target_buyers tb ON tb.buyer_id = cm.buyer_id
    JOIN cohort_universe c ON c.id = cm.cohort_id
    ORDER BY cm.buyer_id, c.created_at DESC, c.id
  ),
  relevant_cohorts AS MATERIALIZED (
    SELECT c.*
    FROM cohort_universe c
    WHERE p_include_summary OR c.id IN (SELECT id FROM page_ids)
  ),
  member_metrics AS MATERIALIZED (
    SELECT cm.cohort_id, count(DISTINCT cm.buyer_id)::bigint AS total_members
    FROM app.cohort_members cm
    JOIN relevant_cohorts c ON c.id = cm.cohort_id
    GROUP BY cm.cohort_id
  ),
  current_metrics AS MATERIALIZED (
    SELECT
      am.cohort_id,
      COALESCE(sum(k.orders_gmv), 0)::numeric AS gmv_mtd,
      COALESCE(sum(k.orders_count), 0)::bigint AS orders_mtd,
      count(DISTINCT k.buyer_id) FILTER (WHERE k.orders_count > 0)::bigint AS active_members
    FROM app.kpi_buyers_daily k
    JOIN attributed_members am ON am.buyer_id = k.buyer_id
    JOIN relevant_cohorts c ON c.id = am.cohort_id
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.location_id IS NULL
      AND k.day >= (p_current_start AT TIME ZONE 'Asia/Kolkata')::date
      AND k.day < (p_current_end_exclusive AT TIME ZONE 'Asia/Kolkata')::date
    GROUP BY am.cohort_id
  ),
  previous_metrics AS MATERIALIZED (
    SELECT am.cohort_id, COALESCE(sum(k.orders_gmv), 0)::numeric AS gmv_previous
    FROM app.kpi_buyers_daily k
    JOIN attributed_members am ON am.buyer_id = k.buyer_id
    JOIN relevant_cohorts c ON c.id = am.cohort_id
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.location_id IS NULL
      AND k.day >= (p_previous_start AT TIME ZONE 'Asia/Kolkata')::date
      AND k.day < (p_previous_end_exclusive AT TIME ZONE 'Asia/Kolkata')::date
    GROUP BY am.cohort_id
  ),
  campaign_metrics AS MATERIALIZED (
    SELECT CASE
      WHEN (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (campaign.scope_value ->> 'cohort_id')::uuid
      ELSE NULL
    END AS cohort_id, count(*)::bigint AS live_catalogs_count
    FROM app.campaigns campaign
    JOIN relevant_cohorts c ON c.id = CASE
      WHEN (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (campaign.scope_value ->> 'cohort_id')::uuid
      ELSE NULL
    END
    WHERE campaign.tenant_id = p_tenant_id
      AND campaign.deleted_at IS NULL
      AND campaign.scope_type = 'cohort'
      AND campaign.status = 'published'
      AND (campaign.valid_from IS NULL OR campaign.valid_from <= statement_timestamp())
      AND (campaign.valid_to IS NULL OR campaign.valid_to >= statement_timestamp())
      AND (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY CASE
      WHEN (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (campaign.scope_value ->> 'cohort_id')::uuid
      ELSE NULL
    END
  ),
  cohort_views AS MATERIALIZED (
    SELECT
      CASE
        WHEN (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (campaign.scope_value ->> 'cohort_id')::uuid
        ELSE NULL
      END AS cohort_id,
      count(DISTINCT cv.buyer_id)::bigint AS catalog_views
    FROM app.campaigns campaign
    JOIN relevant_cohorts c ON c.id = CASE
      WHEN (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (campaign.scope_value ->> 'cohort_id')::uuid
      ELSE NULL
    END
    JOIN app.campaign_views cv ON cv.campaign_id = campaign.id
      AND cv.tenant_id = p_tenant_id
      AND cv.deleted_at IS NULL
      AND cv.viewed_at >= p_current_start
      AND cv.viewed_at < p_current_end_exclusive
    WHERE campaign.tenant_id = p_tenant_id
      AND campaign.deleted_at IS NULL
      AND campaign.scope_type = 'cohort'
      AND (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY CASE
      WHEN (campaign.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (campaign.scope_value ->> 'cohort_id')::uuid
      ELSE NULL
    END
  ),
  row_metrics AS MATERIALIZED (
    SELECT
      c.id,
      COALESCE(cm.gmv_mtd, 0)::numeric AS gmv_mtd,
      COALESCE(pm.gmv_previous, 0)::numeric AS gmv_previous,
      COALESCE(cm.orders_mtd, 0)::bigint AS orders_mtd,
      COALESCE(cm.active_members, 0)::bigint AS active_members,
      COALESCE(mm.total_members, c.cached_member_count, 0)::bigint AS total_members,
      COALESCE(cam.live_catalogs_count, 0)::bigint AS live_catalogs_count,
      COALESCE(cv.catalog_views, (p_views_by_cohort ->> c.id::text)::bigint, 0)::numeric AS catalog_views
    FROM relevant_cohorts c
    LEFT JOIN member_metrics mm ON mm.cohort_id = c.id
    LEFT JOIN current_metrics cm ON cm.cohort_id = c.id
    LEFT JOIN previous_metrics pm ON pm.cohort_id = c.id
    LEFT JOIN campaign_metrics cam ON cam.cohort_id = c.id
    LEFT JOIN cohort_views cv ON cv.cohort_id = c.id
  ),
  enriched AS MATERIALIZED (
    SELECT
      rm.*,
      CASE WHEN rm.gmv_previous > 0 THEN round(((rm.gmv_mtd - rm.gmv_previous) / rm.gmv_previous) * 100)::integer ELSE 0 END AS growth_pct,
      CASE WHEN rm.catalog_views > 0 THEN round((rm.orders_mtd::numeric / rm.catalog_views) * 100, 1) ELSE 0 END AS conversion_pct
    FROM row_metrics rm
  ),
  buyer_summary AS MATERIALIZED (
    SELECT
      count(*) FILTER (WHERE b.is_active = true)::bigint AS total_buyers,
      count(*) FILTER (
        WHERE b.is_active = true
          AND NOT EXISTS (
            SELECT 1
            FROM app.cohort_members cm
            JOIN cohort_universe c ON c.id = cm.cohort_id
            WHERE cm.buyer_id = b.id
          )
      )::bigint AS uncategorised_buyers
    FROM app.buyers b
    WHERE p_include_summary
      AND b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
  ),
  summary_kpis AS MATERIALIZED (
    SELECT
      count(*)::bigint AS total_cohorts,
      COALESCE(sum(e.gmv_mtd), 0)::numeric AS combined_gmv_mtd,
      COALESCE(sum(e.gmv_previous), 0)::numeric AS combined_gmv_previous,
      COALESCE(round(avg(e.conversion_pct), 1), 0)::numeric AS avg_conversion_pct
    FROM enriched e
    WHERE p_include_summary
  ),
  summary AS MATERIALIZED (
    SELECT jsonb_build_object(
      'kpis', jsonb_build_object(
        'total_cohorts', sk.total_cohorts,
        'covered_members', GREATEST(bs.total_buyers - bs.uncategorised_buyers, 0),
        'total_buyers', bs.total_buyers,
        'combined_gmv_mtd', sk.combined_gmv_mtd,
        'growth_pct', CASE WHEN sk.combined_gmv_previous > 0 THEN round(((sk.combined_gmv_mtd - sk.combined_gmv_previous) / sk.combined_gmv_previous) * 100)::integer ELSE 0 END,
        'avg_conversion_pct', sk.avg_conversion_pct,
        'uncategorised_buyers', bs.uncategorised_buyers
      ),
      'callout_metrics', jsonb_build_object(
        'low_conversion', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY conversion_pct, id) FROM (SELECT * FROM enriched ORDER BY conversion_pct, id) rows), '[]'::jsonb),
        'top_performers', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY gmv_mtd DESC, id) FROM (SELECT * FROM enriched ORDER BY gmv_mtd DESC, id) rows), '[]'::jsonb),
        'top_risers', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY growth_pct DESC, id) FROM (SELECT * FROM enriched ORDER BY growth_pct DESC, id) rows), '[]'::jsonb)
      )
    ) AS payload
    FROM summary_kpis sk
    CROSS JOIN buyer_summary bs
    WHERE p_include_summary
  )
  SELECT jsonb_build_object(
    'row_metrics', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'gmv_mtd', e.gmv_mtd,
          'gmv_previous', e.gmv_previous,
          'growth_pct', e.growth_pct,
          'active_members', e.active_members,
          'total_members', e.total_members,
          'conversion_pct', e.conversion_pct,
          'live_catalogs_count', e.live_catalogs_count,
          'orders_mtd', e.orders_mtd
        ) ORDER BY array_position(p_page_ids, e.id)
      )
      FROM enriched e
      WHERE e.id IN (SELECT id FROM page_ids)
    ), '[]'::jsonb),
    'summary', (SELECT payload FROM summary)
  );
$function$;

CREATE OR REPLACE FUNCTION app.get_seller_price_list_landing_aggregates(
  p_tenant_id uuid,
  p_page_ids uuid[],
  p_include_summary boolean DEFAULT true,
  p_now timestamptz DEFAULT statement_timestamp()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $function$
  WITH page_ids AS MATERIALIZED (
    SELECT DISTINCT id
    FROM unnest((COALESCE(p_page_ids, ARRAY[]::uuid[]))[1:200]) AS ids(id)
  ),
  price_list_universe AS MATERIALIZED (
    SELECT
      pl.id,
      pl.name,
      pl.valid_from,
      pl.valid_to,
      pl.is_active,
      CASE
        WHEN pl.valid_to < p_now THEN 'expired'
        WHEN NOT pl.is_active OR pl.valid_from > p_now THEN 'draft'
        ELSE 'active'
      END AS status
    FROM app.price_lists pl
    WHERE pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
  ),
  relevant_price_lists AS MATERIALIZED (
    SELECT pl.*
    FROM price_list_universe pl
    WHERE p_include_summary OR pl.id IN (SELECT id FROM page_ids)
  ),
  item_metrics AS MATERIALIZED (
    SELECT
      pli.price_list_id,
      count(*)::bigint AS product_count,
      count(*) FILTER (WHERE pli.price <> tp.base_selling_price)::bigint AS override_count,
      round(avg(((tp.base_selling_price - pli.price) / NULLIF(tp.base_selling_price, 0)) * 100), 1) AS avg_discount_pct,
      round(avg(((pli.price - tp.cost_price) / NULLIF(pli.price, 0)) * 100) FILTER (WHERE tp.cost_price > 0 AND pli.price > 0), 1) AS avg_margin_pct
    FROM app.price_list_items pli
    JOIN relevant_price_lists pl ON pl.id = pli.price_list_id
    JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
      AND tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
    WHERE pli.deleted_at IS NULL
    GROUP BY pli.price_list_id
  ),
  assignment_metrics AS MATERIALIZED (
    SELECT
      pla.price_list_id,
      count(DISTINCT pla.target_id) FILTER (WHERE pla.target_type = 'cohort' AND pla.target_id IS NOT NULL)::bigint AS cohorts_count,
      COALESCE(
        jsonb_agg(DISTINCT c.name) FILTER (WHERE pla.target_type = 'cohort' AND c.id IS NOT NULL),
        '[]'::jsonb
      ) AS cohort_names
    FROM app.price_list_assignments pla
    JOIN relevant_price_lists pl ON pl.id = pla.price_list_id
    LEFT JOIN app.cohorts c ON c.id = pla.target_id
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
    WHERE pla.deleted_at IS NULL
    GROUP BY pla.price_list_id
  ),
  row_metrics AS MATERIALIZED (
    SELECT
      pl.id,
      COALESCE(im.product_count, 0)::bigint AS product_count,
      COALESCE(im.override_count, 0)::bigint AS override_count,
      im.avg_discount_pct,
      im.avg_margin_pct,
      COALESCE(am.cohorts_count, 0)::bigint AS cohorts_count,
      COALESCE(am.cohort_names, '[]'::jsonb) AS cohort_names
    FROM relevant_price_lists pl
    LEFT JOIN item_metrics im ON im.price_list_id = pl.id
    LEFT JOIN assignment_metrics am ON am.price_list_id = pl.id
  ),
  active_coverage AS MATERIALIZED (
    SELECT DISTINCT pla.target_id AS cohort_id
    FROM app.price_list_assignments pla
    JOIN price_list_universe pl ON pl.id = pla.price_list_id AND pl.status = 'active'
    WHERE p_include_summary
      AND pla.deleted_at IS NULL
      AND pla.target_type = 'cohort'
      AND pla.target_id IS NOT NULL
  ),
  uncovered_cohorts AS MATERIALIZED (
    SELECT c.id, c.name, count(DISTINCT cm.buyer_id)::bigint AS member_count
    FROM app.cohorts c
    LEFT JOIN app.cohort_members cm ON cm.cohort_id = c.id
    WHERE p_include_summary
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM active_coverage ac WHERE ac.cohort_id = c.id)
    GROUP BY c.id, c.name
    ORDER BY member_count DESC, c.id
  ),
  summary AS MATERIALIZED (
    SELECT jsonb_build_object(
      'kpis', jsonb_build_object(
        'active_lists', count(*) FILTER (WHERE pl.status = 'active'),
        'draft_lists', count(*) FILTER (WHERE pl.status = 'draft'),
        'expiring_soon', count(*) FILTER (WHERE pl.status = 'active' AND pl.valid_to >= p_now AND pl.valid_to <= p_now + interval '7 days'),
        'cohorts_covered', (SELECT count(*) FROM active_coverage),
        'cohorts_total', (SELECT count(*) FROM app.cohorts c WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL),
        'products_with_overrides', COALESCE(sum(rm.override_count), 0)
      ),
      'counts', jsonb_build_object(
        'active', count(*) FILTER (WHERE pl.status = 'active'),
        'draft', count(*) FILTER (WHERE pl.status = 'draft'),
        'expired', count(*) FILTER (WHERE pl.status = 'expired')
      ),
      'todays_read', jsonb_build_object(
        'expiring_soon', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', rows.id,
            'name', rows.name,
            'valid_until', rows.valid_to,
            'cohorts_count', COALESCE(am.cohorts_count, 0),
            'status', rows.status
          ) ORDER BY rows.valid_to, rows.id)
          FROM (SELECT * FROM price_list_universe WHERE status = 'active' AND valid_to >= p_now AND valid_to <= p_now + interval '7 days' ORDER BY valid_to, id) rows
          LEFT JOIN assignment_metrics am ON am.price_list_id = rows.id
        ), '[]'::jsonb),
        'most_coverage', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', rows.id,
            'name', rows.name,
            'product_count', rows.product_count,
            'valid_until', rows.valid_to
          ) ORDER BY rows.product_count DESC, rows.id)
          FROM (
            SELECT pl.id, pl.name, pl.valid_to, COALESCE(rm.product_count, 0) AS product_count
            FROM price_list_universe pl
            LEFT JOIN row_metrics rm ON rm.id = pl.id
            ORDER BY product_count DESC, pl.id
          ) rows
        ), '[]'::jsonb),
        'uncovered_cohorts', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'member_count', member_count) ORDER BY member_count DESC, id)
          FROM uncovered_cohorts
        ), '[]'::jsonb)
      )
    ) AS payload
    FROM price_list_universe pl
    LEFT JOIN row_metrics rm ON rm.id = pl.id
    WHERE p_include_summary
  )
  SELECT jsonb_build_object(
    'row_metrics', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', rm.id,
          'product_count', rm.product_count,
          'avg_discount_pct', rm.avg_discount_pct,
          'avg_margin_pct', rm.avg_margin_pct,
          'cohorts_count', rm.cohorts_count,
          'cohort_names', rm.cohort_names
        ) ORDER BY array_position(p_page_ids, rm.id)
      )
      FROM row_metrics rm
      WHERE rm.id IN (SELECT id FROM page_ids)
    ), '[]'::jsonb),
    'summary', (SELECT payload FROM summary)
  );
$function$;

CREATE OR REPLACE FUNCTION app.get_seller_locations_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_today date,
  p_expiry_end date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
AS $$
  WITH scoped_locations AS MATERIALIZED (
    SELECT l.id, l.name, l.address, COALESCE(l.status, 'active') AS status
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (p_location_ids IS NULL OR l.id = ANY(p_location_ids))
  ), location_rollup AS MATERIALIZED (
    SELECT
      l.id,
      l.name,
      COALESCE(l.address ->> 'city', '') AS city,
      l.status,
      COALESCE(ls.receivable_amount, 0) AS outstanding_dues,
      COALESCE(ls.overdue_amount, 0) AS overdue_amount,
      COALESCE(ls.invoice_count_90d, 0) AS invoice_count_90d,
      COALESCE(ls.open_estimate_count, 0) AS open_estimate_count,
      COALESCE(ls.out_of_stock_product_count, 0) AS oos_sku_count,
      COALESCE(ls.low_stock_product_count, 0) AS low_stock_sku_count,
      COALESCE(ls.purchasing_buyers_90d, 0) AS buyers_count,
      COALESCE(SUM(ld.invoice_value), 0) AS gmv
    FROM scoped_locations l
    LEFT JOIN app.metrics_location_snapshot ls
      ON ls.tenant_id = p_tenant_id
      AND ls.location_id = l.id
      AND ls.deleted_at IS NULL
    LEFT JOIN app.metrics_location_daily ld
      ON ld.tenant_id = p_tenant_id
      AND ld.location_id = l.id
      AND ld.deleted_at IS NULL
      AND ld.day >= p_current_start
      AND ld.day < p_current_end_exclusive
    GROUP BY l.id, l.name, l.address, l.status, ls.receivable_amount, ls.overdue_amount,
      ls.invoice_count_90d, ls.open_estimate_count, ls.out_of_stock_product_count,
      ls.low_stock_product_count, ls.purchasing_buyers_90d
  ), oldest_due AS MATERIALIZED (
    SELECT
      i.location_id,
      MAX((p_today - (i.due_date AT TIME ZONE 'Asia/Kolkata')::date))::integer AS oldest_unpaid_days
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IN (SELECT id FROM scoped_locations)
      AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      AND i.due_date IS NOT NULL
    GROUP BY i.location_id
  ), top_locations AS MATERIALIZED (
    SELECT lr.*
    FROM location_rollup lr
    WHERE lr.gmv > 0
    ORDER BY lr.gmv DESC, lr.id
  ), invoice_counts AS MATERIALIZED (
    SELECT
      COUNT(*)::bigint AS total_invoice_count,
      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance))::bigint AS unpaid_invoice_count
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IN (SELECT id FROM scoped_locations)
  ), estimate_counts AS MATERIALIZED (
    SELECT
      COUNT(*)::bigint AS total_estimate_count,
      COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status))::bigint AS open_estimate_count
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.location_id IN (SELECT id FROM scoped_locations)
  ), conversion_rows AS MATERIALIZED (
    SELECT e.id, e.estimate_number, e.total_amount, e.expires_at, COALESCE(b.business_name, 'Unknown buyer') AS business_name
    FROM app.estimates e
    JOIN scoped_locations l ON l.id = e.location_id
    LEFT JOIN app.buyers b ON b.id = e.buyer_id AND b.tenant_id = p_tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.expires_at IS NOT NULL
      AND e.expires_at::date >= p_today
      AND e.expires_at::date <= p_expiry_end
      AND app.estimate_status_is_open(e.status)
    ORDER BY e.expires_at, e.id
  ), totals AS MATERIALIZED (
    SELECT
      COUNT(*) FILTER (WHERE lower(status) = 'active')::bigint AS active_locations,
      COALESCE(SUM(outstanding_dues), 0) AS outstanding_dues_total,
      COUNT(*) FILTER (WHERE outstanding_dues > 0)::bigint AS dues_location_count,
      COALESCE(SUM(gmv), 0) AS total_gmv
    FROM location_rollup
  ), top_one AS MATERIALIZED (
    SELECT name, gmv
    FROM location_rollup
    ORDER BY gmv DESC, id
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_locations', totals.active_locations,
      'unpaid_invoice_count', invoice_counts.unpaid_invoice_count,
      'total_invoice_count', invoice_counts.total_invoice_count,
      'outstanding_dues_total', totals.outstanding_dues_total,
      'dues_location_count', totals.dues_location_count,
      'open_estimate_count', estimate_counts.open_estimate_count,
      'total_estimate_count', estimate_counts.total_estimate_count,
      'top_location_name', top_one.name,
      'top_location_gmv_share_pct', CASE WHEN totals.total_gmv > 0 THEN ROUND((top_one.gmv / totals.total_gmv) * 100) ELSE 0 END
    ),
    'callouts', jsonb_build_object(
      'conversions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', c.business_name,
          'city', '',
          'initials', upper(left(regexp_replace(c.business_name, '[^[:alnum:]]', '', 'g'), 2)),
          'estimate_number', c.estimate_number,
          'expires_in_days', GREATEST((c.expires_at::date - p_today), 0),
          'total_amount', COALESCE(c.total_amount, 0)
        ) ORDER BY c.expires_at, c.id)
        FROM conversion_rows c
      ), '[]'::jsonb),
      'top_locations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'city', t.city,
          'initials', upper(left(regexp_replace(t.name, '[^[:alnum:]]', '', 'g'), 2)),
          'gmv_mtd', t.gmv,
          'orders_count', 0,
          'buyers_count', t.buyers_count
        ) ORDER BY t.gmv DESC, t.id)
        FROM top_locations t
      ), '[]'::jsonb),
      'collections_overdue', COALESCE((
        SELECT jsonb_agg(row_data ORDER BY outstanding_dues DESC, id)
        FROM (
          SELECT
            lr.id,
            lr.outstanding_dues,
            jsonb_build_object(
              'id', lr.id,
              'name', lr.name,
              'city', lr.city,
              'initials', upper(left(regexp_replace(lr.name, '[^[:alnum:]]', '', 'g'), 2)),
              'outstanding_dues', lr.outstanding_dues,
              'oldest_unpaid_days', od.oldest_unpaid_days
            ) AS row_data
          FROM location_rollup lr
          JOIN oldest_due od ON od.location_id = lr.id
          WHERE lr.overdue_amount > 0
          ORDER BY lr.outstanding_dues DESC, lr.id
        ) overdue
      ), '[]'::jsonb)
    )
  )
  FROM totals
  CROSS JOIN invoice_counts
  CROSS JOIN estimate_counts
  LEFT JOIN top_one ON true;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_warehouses_landing_summary_v2(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH scoped AS MATERIALIZED (
    SELECT
      w.id,
      w.name,
      COALESCE(w.address ->> 'city', '') AS city,
      w.status,
      w.updated_at,
      COALESCE(ws.tracked_skus, 0) AS tracked_skus,
      COALESCE(ws.low_stock_skus, 0) AS low_stock_skus,
      COALESCE(ws.stockout_skus, 0) AS stockout_skus,
      COALESCE(ws.idle_stock_skus, 0) AS idle_stock_skus,
      COALESCE(ws.last_inventory_update, w.updated_at) AS last_updated
    FROM app.warehouses w
    LEFT JOIN app.warehouses_snapshot ws
      ON ws.tenant_id = p_tenant_id
      AND ws.warehouse_id = w.id
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (p_location_ids IS NULL OR w.location_id = ANY(p_location_ids))
  ), totals AS (
    SELECT
      count(*) FILTER (WHERE status = 'active')::bigint AS active_warehouses,
      COALESCE(sum(tracked_skus), 0)::bigint AS tracked_skus,
      count(*) FILTER (WHERE low_stock_skus > 0 OR stockout_skus > 0)::bigint AS low_stock_warehouses,
      COALESCE(sum(idle_stock_skus), 0)::bigint AS idle_stock_skus
    FROM scoped
  ), stock_attention AS (
    SELECT id, name, city, low_stock_skus + stockout_skus AS value
    FROM scoped
    WHERE low_stock_skus > 0 OR stockout_skus > 0
    ORDER BY low_stock_skus + stockout_skus DESC, id
  ), idle_stock AS (
    SELECT id, name, city, idle_stock_skus AS value
    FROM scoped
    WHERE idle_stock_skus > 0
    ORDER BY idle_stock_skus DESC, id
  ), recently_replenished AS (
    SELECT id, name, city, tracked_skus AS value, last_updated
    FROM scoped
    ORDER BY last_updated DESC NULLS LAST, id
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_warehouses', totals.active_warehouses,
      'tracked_skus', totals.tracked_skus,
      'low_stock_warehouses', totals.low_stock_warehouses,
      'idle_stock_skus', totals.idle_stock_skus
    ),
    'callouts', jsonb_build_object(
      'stock_attention', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value
        ) ORDER BY r.value DESC, r.id)
        FROM stock_attention r
      ), '[]'::jsonb),
      'idle_stock', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value
        ) ORDER BY r.value DESC, r.id)
        FROM idle_stock r
      ), '[]'::jsonb),
      'recently_replenished', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value,
          'last_updated', r.last_updated
        ) ORDER BY r.last_updated DESC NULLS LAST, r.id)
        FROM recently_replenished r
      ), '[]'::jsonb)
    )
  )
  FROM totals;
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
      ) ranked), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('buyer_id', ranked.id, 'name', ranked.business_name) ORDER BY ranked.business_name)
      FROM (
        SELECT b.id, b.business_name
        FROM app.buyers b
        JOIN used u ON u.buyer_id = b.id
        LEFT JOIN demand d ON d.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND d.buyer_id IS NULL
        ORDER BY b.business_name
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
