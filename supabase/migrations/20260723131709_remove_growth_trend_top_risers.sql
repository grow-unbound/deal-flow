-- Remove growth %, trend, and "top risers"-style calculations across seller
-- landing pages, per explicit direction: specs/kpi-callout-audit-2026-07-23.md
-- §6 rule 12 / §7 P2 item 10. Trend needs >=180 days of operating history to
-- mean anything and this app doesn't have that yet. Per rule 12 this is a
-- REMOVAL, not a fix/stub -- anywhere a growth_pct/trend_vs_*/*_previous
-- field or a "top risers" callout was found, it comes out here, along with
-- Brands' gmv_decline alert (also a current-vs-previous-period trend check).
--
-- Covers (seller side only -- Buyer App Home's "trend vs last month" card is
-- a separate, already-tracked task):
--   1. app.get_seller_location_landing_row_metrics -- row-level growth_pct
--      source (gmv_current/gmv_previous), consumed client-side in
--      app/api/tenant/locations/landing/route.ts.
--   2. app.get_seller_category_landing_page_metrics_v2 -- row-level
--      growth_pct source (gmv_current/gmv_previous), consumed client-side in
--      src/lib/server/categories-landing.ts.
--   3. app.metrics_v2_products_landing -- revenue_growth_pct (previously
--      flagged as a stub bug: previous_revenue_90d hardcoded to 0, making
--      growth always read 100%; now removed outright instead of fixed).
--   4. app.get_seller_brand_landing_rows -- per-brand growth_pct/gmv_prev_mtd
--      (table's Trend column) and the gmv_decline entry in its alerts array.
--   5. app.get_seller_brand_landing_summary -- brand_rollup.growth_pct, the
--      top_risers callout, and needs_attention/gmv_decline (needs_attention's
--      ONLY alert source was gmv_decline -- with that gone the callout can
--      never return a row, so it comes out entirely rather than being left as
--      a silent always-empty stub, same treatment as top_risers).
--   6. app.get_seller_cohort_landing_aggregates -- row/summary growth_pct and
--      gmv_previous (a same-session no-op already reading 0 -- see
--      20260723125928_drop_kpi_buyers_daily_v1_table.sql's header) and the
--      top_risers callout.
--   7. app.metrics_v2_transaction_landing (p_kind = orders/estimates/invoices)
--      -- orders_growth_pct / total_estimates_growth_pct / invoices_growth_pct.
--      orders_prev_mtd/gmv_prev_mtd and their estimates/invoices equivalents
--      are kept: nothing else in this migration touches them, and they still
--      power the *_prev_period KPI fields shown as plain figures (not a % or
--      trend), so they stay.
--
-- Where the previous-period column was purely a growth_pct input with no
-- other reader (Locations row metrics, Categories row metrics, Cohorts), the
-- column and its params are dropped outright. Where the previous-period
-- window is also load-bearing for unrelated location/buyer/product scoping
-- logic in the same query (Brands' rows + summary functions), the params and
-- underlying previous-period computation are left in place and only the
-- DERIVED growth_pct/gmv_decline/top_risers output is removed -- per the
-- instruction to leave the data field alone when removing it risks breaking
-- an unrelated consumer.

-- =============================================================================
-- 1. app.get_seller_location_landing_row_metrics
--    Drops p_previous_start/p_previous_end_exclusive (no longer needed -- the
--    `sales` CTE only ever used them to compute gmv_previous) and the
--    gmv_previous output column. Signature shrinks from 6 to 4 params, so the
--    old overload is dropped first.
-- =============================================================================
DROP FUNCTION IF EXISTS app.get_seller_location_landing_row_metrics(uuid, uuid[], date, date, date, date);

CREATE FUNCTION app.get_seller_location_landing_row_metrics(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date
)
RETURNS TABLE(
  location_id uuid,
  sku_count bigint,
  oos_sku_count bigint,
  low_stock_sku_count bigint,
  outstanding_dues numeric,
  oldest_unpaid_days integer,
  gmv_current numeric,
  active_buyers bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT l.id
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND l.id = ANY(COALESCE(p_location_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), due_age AS MATERIALIZED (
    SELECT
      i.location_id,
      MAX(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - (i.due_date AT TIME ZONE 'Asia/Kolkata')::date))::integer AS oldest_unpaid_days
    FROM app.invoices i
    JOIN requested r ON r.id = i.location_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      AND i.due_date IS NOT NULL
    GROUP BY i.location_id
  ), sales AS MATERIALIZED (
    SELECT
      ld.location_id,
      COALESCE(SUM(ld.invoice_value), 0) AS gmv_current
    FROM app.metrics_location_daily ld
    JOIN requested r ON r.id = ld.location_id
    WHERE ld.tenant_id = p_tenant_id
      AND ld.deleted_at IS NULL
      AND ld.day >= p_current_start
      AND ld.day < p_current_end_exclusive
    GROUP BY ld.location_id
  )
  SELECT
    r.id,
    COALESCE(ls.stocked_product_count, 0),
    COALESCE(ls.out_of_stock_product_count, 0),
    COALESCE(ls.low_stock_product_count, 0),
    COALESCE(ls.receivable_amount, 0),
    da.oldest_unpaid_days,
    COALESCE(s.gmv_current, 0),
    COALESCE(ls.purchasing_buyers_90d, 0)
  FROM requested r
  LEFT JOIN app.metrics_location_snapshot ls
    ON ls.tenant_id = p_tenant_id
    AND ls.location_id = r.id
    AND ls.deleted_at IS NULL
  LEFT JOIN due_age da ON da.location_id = r.id
  LEFT JOIN sales s ON s.location_id = r.id;
$$;

REVOKE ALL ON FUNCTION app.get_seller_location_landing_row_metrics(uuid, uuid[], date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_location_landing_row_metrics(uuid, uuid[], date, date) TO service_role;

-- =============================================================================
-- 2. app.get_seller_category_landing_page_metrics_v2
--    Same treatment as Locations above: drops p_previous_start/
--    p_previous_end_exclusive and the gmv_previous output column. Signature
--    shrinks from 7 to 5 params.
-- =============================================================================
DROP FUNCTION IF EXISTS app.get_seller_category_landing_page_metrics_v2(uuid, uuid[], date, date, date, date, date);

CREATE FUNCTION app.get_seller_category_landing_page_metrics_v2(
  p_tenant_id uuid,
  p_category_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_velocity_start date
)
RETURNS TABLE(
  tenant_category_id uuid,
  active_sku_count bigint,
  oos_sku_count bigint,
  low_stock_sku_count bigint,
  brand_count bigint,
  gmv_current numeric,
  units_current bigint,
  buyers_current bigint,
  avg_days_cover numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT tc.id
    FROM app.tenant_categories tc
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND tc.id = ANY(COALESCE(p_category_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), products AS MATERIALIZED (
    SELECT tp.id, tp.tenant_category_id, tp.tenant_brand_id
    FROM app.tenant_products tp
    JOIN requested r ON r.id = tp.tenant_category_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), inventory_metrics AS MATERIALIZED (
    SELECT
      p.tenant_category_id,
      COUNT(*) AS active_sku_count,
      COUNT(*) FILTER (WHERE COALESCE(mps.out_of_stock, false)) AS oos_sku_count,
      COUNT(*) FILTER (WHERE COALESCE(mps.low_stock, false) AND NOT COALESCE(mps.out_of_stock, false)) AS low_stock_sku_count,
      COUNT(DISTINCT p.tenant_brand_id) AS brand_count,
      ROUND(AVG(mps.days_cover)::numeric, 2) AS avg_days_cover
    FROM products p
    LEFT JOIN app.metrics_product_snapshot mps
      ON mps.tenant_id = p_tenant_id
      AND mps.tenant_product_id = p.id
      AND mps.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  ), invoice_metrics AS MATERIALIZED (
    SELECT
      p.tenant_category_id,
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN COALESCE(ii.line_total, 0) ELSE 0 END) AS gmv_current,
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive THEN COALESCE(ii.qty, 0) ELSE 0 END)::bigint AS units_current,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE i.buyer_id IS NOT NULL
          AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
          AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
      ) AS buyers_current
    FROM app.invoice_items ii
    JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
    JOIN products p ON p.id = ii.tenant_product_id
    WHERE ii.deleted_at IS NULL
    GROUP BY p.tenant_category_id
  )
  SELECT
    r.id,
    COALESCE(im.active_sku_count, 0),
    COALESCE(im.oos_sku_count, 0),
    COALESCE(im.low_stock_sku_count, 0),
    COALESCE(im.brand_count, 0),
    COALESCE(vm.gmv_current, 0),
    COALESCE(vm.units_current, 0),
    COALESCE(vm.buyers_current, 0),
    im.avg_days_cover
  FROM requested r
  LEFT JOIN inventory_metrics im ON im.tenant_category_id = r.id
  LEFT JOIN invoice_metrics vm ON vm.tenant_category_id = r.id;
$$;

REVOKE ALL ON FUNCTION app.get_seller_category_landing_page_metrics_v2(uuid, uuid[], date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_category_landing_page_metrics_v2(uuid, uuid[], date, date, date) TO service_role;

-- =============================================================================
-- 3. app.metrics_v2_products_landing
--    revenue_growth_pct was previously flagged as a stub bug
--    (previous_revenue_90d hardcoded to 0, so growth always read 100%) --
--    per rule 12 the correct fix now is removal, not fixing the stub.
--    RETURNS jsonb, so no signature change -- CREATE OR REPLACE is safe.
-- =============================================================================
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
    COALESCE(SUM(revenue_90d), 0)
  INTO v_total_skus, v_active_skus, v_archived_skus, v_out_of_stock, v_low_stock,
    v_recently_sold_out_of_stock, v_products_sold, v_units, v_revenue
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

-- =============================================================================
-- 4. app.get_seller_brand_landing_rows
--    Per-brand growth_pct/gmv_prev_mtd (the table's Trend column) and the
--    gmv_decline entry in the alerts array come out. low_stock/
--    not_in_catalog_mtd alerts are unrelated to growth/trend and stay.
--    p_previous_start/p_previous_end and the underlying previous_gmv
--    computation stay too -- LEAST(p_previous_start, p_current_start)/
--    GREATEST(p_previous_end, p_current_end) also widen the location/buyer
--    scoping windows in scoped_products and scoped_buyers in this same
--    query, so removing the params would change unrelated scoping behavior.
--    RETURNS TABLE(id uuid, row_data jsonb) is unchanged (only the jsonb
--    contents differ), so CREATE OR REPLACE is safe -- no signature change.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_seller_brand_landing_rows(
  p_tenant_id uuid,
  p_brand_ids uuid[],
  p_location_ids uuid[] DEFAULT NULL,
  p_current_start date DEFAULT CURRENT_DATE,
  p_current_end date DEFAULT CURRENT_DATE + 1,
  p_previous_start date DEFAULT CURRENT_DATE - 1,
  p_previous_end date DEFAULT CURRENT_DATE
)
RETURNS TABLE(id uuid, row_data jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, catalog
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
WITH requested AS MATERIALIZED (
  SELECT requested_id AS id, ord
  FROM unnest(COALESCE(p_brand_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS ids(requested_id, ord)
  WHERE requested_id IS NOT NULL
  LIMIT 100
),
brand_base AS MATERIALIZED (
  SELECT tb.*, r.ord,
    cb.id AS master_id, cb.name AS master_name, cb.slug AS master_slug,
    cb.logo_url AS master_logo_url, cb.description AS master_description
  FROM requested r
  JOIN app.tenant_brands tb ON tb.id = r.id
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id AND cb.deleted_at IS NULL
  WHERE tb.tenant_id = p_tenant_id AND tb.deleted_at IS NULL AND tb.is_active = true
),
scoped_products AS MATERIALIZED (
  SELECT tp.id, tp.tenant_brand_id, tp.master_product_id, tp.tenant_category_id
  FROM app.tenant_products tp
  JOIN requested r ON r.id = tp.tenant_brand_id
  WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL AND tp.is_active = true
    AND (
      p_location_ids IS NULL
      OR EXISTS (
        SELECT 1
        FROM app.tenant_inventory ti
        JOIN app.warehouses w ON w.id = ti.warehouse_id
          AND w.tenant_id = p_tenant_id AND w.deleted_at IS NULL
        WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
          AND w.location_id = ANY(p_location_ids)
      )
      OR EXISTS (
        SELECT 1
        FROM app.order_items oi
        JOIN app.orders o ON o.id = oi.order_id
        WHERE oi.tenant_product_id = tp.id AND oi.deleted_at IS NULL
          AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
          AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
          AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
      )
    )
),
product_rollup AS (
  SELECT sp.tenant_brand_id,
    count(*)::bigint AS sku_count,
    COALESCE(
      jsonb_agg(DISTINCT COALESCE(tc.name, cc.name, 'Uncategorized')),
      '["Uncategorized"]'::jsonb
    ) AS categories
  FROM scoped_products sp
  LEFT JOIN app.tenant_categories tc ON tc.id = sp.tenant_category_id
    AND tc.tenant_id = p_tenant_id AND tc.deleted_at IS NULL
  LEFT JOIN catalog.products cp ON cp.id = sp.master_product_id AND cp.deleted_at IS NULL
  LEFT JOIN catalog.categories cc ON cc.id = cp.category_id AND cc.deleted_at IS NULL
  GROUP BY sp.tenant_brand_id
),
inventory_rollup AS (
  SELECT sp.tenant_brand_id,
    count(DISTINCT sp.id) FILTER (
      WHERE ti.reorder_point IS NOT NULL AND COALESCE(ti.qty_available, 0) <= ti.reorder_point
    )::bigint AS low_stock_skus
  FROM scoped_products sp
  LEFT JOIN app.tenant_inventory ti ON ti.tenant_product_id = sp.id AND ti.deleted_at IS NULL
  LEFT JOIN app.warehouses w ON w.id = ti.warehouse_id
    AND w.tenant_id = p_tenant_id AND w.deleted_at IS NULL
  WHERE p_location_ids IS NULL OR w.location_id = ANY(p_location_ids)
  GROUP BY sp.tenant_brand_id
),
admin_sales AS (
  SELECT k.tenant_brand_id,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::numeric AS current_gmv,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_previous_start AND k.day < p_previous_end), 0)::numeric AS previous_gmv,
    COALESCE(sum(k.buyers_count) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::bigint AS active_buyers
  FROM app.kpi_brand_daily k
  JOIN requested r ON r.id = k.tenant_brand_id
  WHERE p_location_ids IS NULL AND k.tenant_id = p_tenant_id
    AND k.day >= LEAST(p_previous_start, p_current_start)
    AND k.day < GREATEST(p_previous_end, p_current_end)
  GROUP BY k.tenant_brand_id
),
assistant_sales AS (
  SELECT tp.tenant_brand_id,
    COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
    ), 0)::numeric AS current_gmv,
    COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_previous_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_previous_end
    ), 0)::numeric AS previous_gmv,
    count(DISTINCT o.buyer_id) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
    )::bigint AS active_buyers
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
  JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
  JOIN requested r ON r.id = tp.tenant_brand_id
  WHERE p_location_ids IS NOT NULL
    AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
    AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
  GROUP BY tp.tenant_brand_id
),
sales AS (
  SELECT * FROM admin_sales
  UNION ALL
  SELECT * FROM assistant_sales
),
portfolio AS (
  SELECT COALESCE(sum(k.gmv), 0)::numeric AS current_gmv
  FROM app.kpi_brand_daily k
  WHERE p_location_ids IS NULL AND k.tenant_id = p_tenant_id
    AND k.day >= p_current_start AND k.day < p_current_end
  UNION ALL
  SELECT COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
  WHERE p_location_ids IS NOT NULL AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
    AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
),
portfolio_total AS (SELECT COALESCE(sum(current_gmv), 0)::numeric AS current_gmv FROM portfolio),
catalog_rollup AS (
  SELECT sp.tenant_brand_id,
    count(*) FILTER (
      WHERE (c.updated_at AT TIME ZONE 'Asia/Kolkata')::date >= p_current_start
        AND (c.updated_at AT TIME ZONE 'Asia/Kolkata')::date < p_current_end
    )::bigint AS current_touches,
    (array_agg(c.name ORDER BY c.updated_at DESC))[1] AS latest_name,
    max(c.updated_at) AS latest_at
  FROM scoped_products sp
  JOIN app.campaign_items ci ON ci.tenant_product_id = sp.id AND ci.deleted_at IS NULL
  JOIN app.campaigns c ON c.id = ci.campaign_id
    AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND c.status = 'published'
  GROUP BY sp.tenant_brand_id
),
scoped_buyers AS MATERIALIZED (
  SELECT b.id, b.default_cohort_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    AND (
      p_location_ids IS NULL
      OR EXISTS (
        SELECT 1 FROM app.orders o
        WHERE o.tenant_id = p_tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
          AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
          AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
      )
    )
),
buyer_cohorts AS (
  SELECT id AS buyer_id, default_cohort_id AS cohort_id FROM scoped_buyers WHERE default_cohort_id IS NOT NULL
  UNION
  SELECT sb.id, cm.cohort_id FROM scoped_buyers sb JOIN app.cohort_members cm ON cm.buyer_id = sb.id AND cm.valid_until IS NULL
),
buyer_access AS (
  SELECT r.id AS tenant_brand_id, count(DISTINCT bc.buyer_id)::bigint AS total_buyers
  FROM requested r
  LEFT JOIN buyer_cohorts bc ON true
  LEFT JOIN app.cohorts c ON c.id = bc.cohort_id
    AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    AND (c.allowed_tenant_brand_ids IS NULL OR r.id = ANY(c.allowed_tenant_brand_ids))
  WHERE c.id IS NOT NULL
  GROUP BY r.id
)
SELECT bb.id,
  jsonb_build_object(
    'id', bb.id,
    'tenant_id', bb.tenant_id,
    'master_brand_id', bb.master_brand_id,
    'display_name_override', bb.display_name_override,
    'slug', bb.slug,
    'description', COALESCE(bb.description, bb.description_override),
    'logo_url', COALESCE(bb.logo_url, bb.logo_url_override),
    'margin_pct', bb.margin_pct,
    'exclusivity', bb.exclusivity,
    'is_active', bb.is_active,
    'external_ref', bb.external_ref,
    'principal_name', bb.principal_name,
    'principal_email', bb.principal_email,
    'principal_phone', bb.principal_phone,
    'principal_location', bb.principal_location,
    'contact_name', bb.contact_name,
    'contact_email', bb.contact_email,
    'contact_phone', bb.contact_phone,
    'default_cohort_id', bb.default_cohort_id,
    'created_at', bb.created_at,
    'updated_at', bb.updated_at,
    'master_brand', CASE WHEN bb.master_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', bb.master_id, 'name', bb.master_name, 'slug', bb.master_slug,
      'logo_url', bb.master_logo_url, 'description', bb.master_description
    ) END,
    'gmv_mtd', COALESCE(s.current_gmv, 0),
    'portfolio_share_pct', CASE WHEN pt.current_gmv > 0 THEN round(COALESCE(s.current_gmv, 0) / pt.current_gmv * 100) ELSE 0 END,
    'sku_count', COALESCE(pr.sku_count, 0),
    'active_buyers_mtd', COALESCE(s.active_buyers, 0),
    'total_buyers', COALESCE(ba.total_buyers, 0),
    'catalog_days_ago', CASE WHEN cr.latest_at IS NULL THEN NULL ELSE GREATEST(0, CURRENT_DATE - (cr.latest_at AT TIME ZONE 'Asia/Kolkata')::date) END,
    'categories', COALESCE(pr.categories, '["Uncategorized"]'::jsonb),
    'catalog_name', cr.latest_name,
    'alerts', to_jsonb(array_remove(ARRAY[
      CASE WHEN COALESCE(ir.low_stock_skus, 0) > 0 THEN 'low_stock' END,
      CASE WHEN COALESCE(cr.current_touches, 0) = 0 THEN 'not_in_catalog_mtd' END
    ], NULL))
  ) AS row_data
FROM brand_base bb
LEFT JOIN product_rollup pr ON pr.tenant_brand_id = bb.id
LEFT JOIN inventory_rollup ir ON ir.tenant_brand_id = bb.id
LEFT JOIN sales s ON s.tenant_brand_id = bb.id
CROSS JOIN portfolio_total pt
LEFT JOIN catalog_rollup cr ON cr.tenant_brand_id = bb.id
LEFT JOIN buyer_access ba ON ba.tenant_brand_id = bb.id
ORDER BY bb.ord;
$$;

-- =============================================================================
-- 5. app.get_seller_brand_landing_summary
--    - brand_rollup.growth_pct/alerts (gmv_decline) removed. gmv_decline was
--      needs_attention's ONLY alert source, so needs_attention/
--      need_attention_count come out entirely rather than being left as an
--      always-empty stub (same treatment as top_risers below).
--    - top_risers CTE + todays_read.top_risers removed entirely.
--    - portfolio.previous_gmv / kpis.portfolio_gmv_prev_mtd removed (their
--      only reader was the growth_pct/decline math above).
--    - p_previous_start/p_previous_end stay: visible_brands' location-scope
--      EXISTS checks independently use LEAST(p_previous_start,
--      p_current_start)/GREATEST(...) to widen the order/estimate-activity
--      window, unrelated to the gmv trend math being removed here.
--    RETURNS jsonb, so no signature change -- CREATE OR REPLACE is safe.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.get_seller_brand_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_current_start date DEFAULT CURRENT_DATE,
  p_current_end date DEFAULT CURRENT_DATE + 1,
  p_previous_start date DEFAULT CURRENT_DATE - 1,
  p_previous_end date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, catalog
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
WITH demand_kind AS MATERIALIZED (
  SELECT app.metrics_v2_primary_demand_kind(p_tenant_id) AS kind
),
period_brand AS MATERIALIZED (
  SELECT k.tenant_brand_id,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::numeric AS current_gmv
  FROM app.kpi_brand_daily k
  CROSS JOIN demand_kind dk
  WHERE p_location_ids IS NULL AND dk.kind IN ('orders', 'none') AND k.tenant_id = p_tenant_id
    AND k.day >= p_current_start
    AND k.day < p_current_end
  GROUP BY k.tenant_brand_id
  UNION ALL
  SELECT tp.tenant_brand_id,
    COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
    ), 0)::numeric
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
  JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
  CROSS JOIN demand_kind dk
  WHERE p_location_ids IS NOT NULL AND dk.kind IN ('orders', 'none') AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
    AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
  GROUP BY tp.tenant_brand_id
  UNION ALL
  -- Estimate-primary tenants: no kpi_brand_daily-equivalent snapshot exists for
  -- estimates, so this is always a live query (tenant-wide and location-scoped alike),
  -- gated to only run when the tenant's primary demand kind is 'estimates'. Predicate
  -- mirrors app.get_catalog_landing_metrics' estimates-demand branch: open (draft/sent)
  -- or accepted, and not yet converted to an order (an order-primary-shaped document at
  -- that point, already counted -- moot here since orders branches are inactive for
  -- estimate-primary tenants, but kept for semantic parity).
  SELECT tp.tenant_brand_id,
    COALESCE(sum(COALESCE(ei.line_total, ei.qty * ei.unit_price)) FILTER (
      WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= p_current_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < p_current_end
    ), 0)::numeric
  FROM app.estimates e
  JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
  JOIN app.tenant_products tp ON tp.id = ei.tenant_product_id
    AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
  CROSS JOIN demand_kind dk
  WHERE dk.kind = 'estimates' AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
    AND (p_location_ids IS NULL OR e.location_id = ANY(p_location_ids))
    AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
    AND e.converted_to_order_id IS NULL
    AND app.metric_day_ist(e.estimate_date, e.created_at) >= p_current_start
    AND app.metric_day_ist(e.estimate_date, e.created_at) < p_current_end
  GROUP BY tp.tenant_brand_id
),
visible_brands AS MATERIALIZED (
  SELECT tb.id, COALESCE(tb.display_name_override, cb.name, 'Unknown brand') AS name
  FROM app.tenant_brands tb
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id AND cb.deleted_at IS NULL
  CROSS JOIN demand_kind dk
  WHERE tb.tenant_id = p_tenant_id AND tb.deleted_at IS NULL AND tb.is_active = true
    AND (
      p_location_ids IS NULL
      OR EXISTS (
        SELECT 1 FROM app.tenant_products tp
        WHERE tp.tenant_id = p_tenant_id AND tp.tenant_brand_id = tb.id
          AND tp.deleted_at IS NULL AND tp.is_active = true
          AND (
            EXISTS (
              SELECT 1 FROM app.tenant_inventory ti
              JOIN app.warehouses w ON w.id = ti.warehouse_id
                AND w.tenant_id = p_tenant_id AND w.deleted_at IS NULL
              WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
                AND w.location_id = ANY(p_location_ids)
            )
            OR (
              dk.kind IN ('orders', 'none') AND EXISTS (
                SELECT 1 FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id
                WHERE oi.tenant_product_id = tp.id AND oi.deleted_at IS NULL
                  AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
                  AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
                  AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
                  AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
              )
            )
            OR (
              dk.kind = 'estimates' AND EXISTS (
                SELECT 1 FROM app.estimate_items ei JOIN app.estimates e ON e.id = ei.estimate_id
                WHERE ei.tenant_product_id = tp.id AND ei.deleted_at IS NULL
                  AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
                  AND e.location_id = ANY(p_location_ids)
                  AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
                  AND e.converted_to_order_id IS NULL
                  AND app.metric_day_ist(e.estimate_date, e.created_at) >= LEAST(p_previous_start, p_current_start)
                  AND app.metric_day_ist(e.estimate_date, e.created_at) < GREATEST(p_previous_end, p_current_end)
              )
            )
          )
      )
    )
),
brand_rollup AS MATERIALIZED (
  SELECT vb.id, vb.name, COALESCE(pb.current_gmv, 0)::numeric AS current_gmv
  FROM visible_brands vb
  LEFT JOIN period_brand pb ON pb.tenant_brand_id = vb.id
),
portfolio AS (
  SELECT COALESCE(sum(current_gmv), 0)::numeric AS current_gmv FROM brand_rollup
),
buyer_counts AS (
  SELECT
    count(DISTINCT b.id)::bigint AS total_buyers,
    COALESCE((
      SELECT count(DISTINCT ob.buyer_id) FROM (
        SELECT o.buyer_id
        FROM app.orders o
        CROSS JOIN demand_kind dk
        WHERE dk.kind IN ('orders', 'none') AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
          AND (p_location_ids IS NULL OR o.location_id = ANY(p_location_ids))
          AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
          AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
          AND app.order_status_in_flow(o.status)
        UNION ALL
        SELECT e.buyer_id
        FROM app.estimates e
        CROSS JOIN demand_kind dk
        WHERE dk.kind = 'estimates' AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
          AND (p_location_ids IS NULL OR e.location_id = ANY(p_location_ids))
          AND app.metric_day_ist(e.estimate_date, e.created_at) >= p_current_start
          AND app.metric_day_ist(e.estimate_date, e.created_at) < p_current_end
          AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
          AND e.converted_to_order_id IS NULL
      ) ob
    ), 0)::bigint AS active_buyers
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    AND (
      p_location_ids IS NULL
      OR EXISTS (
        SELECT 1 FROM app.metrics_buyer_location_snapshot mbs
        WHERE mbs.tenant_id = p_tenant_id AND mbs.buyer_id = b.id
          AND mbs.location_id = ANY(p_location_ids) AND mbs.deleted_at IS NULL
      )
    )
),
catalog_stats AS (
  SELECT count(*)::bigint AS total_campaigns,
    count(*) FILTER (
      WHERE (updated_at AT TIME ZONE 'Asia/Kolkata')::date >= p_current_start
        AND (updated_at AT TIME ZONE 'Asia/Kolkata')::date < p_current_end
    )::bigint AS current_campaigns,
    min((updated_at AT TIME ZONE 'Asia/Kolkata')::date) FILTER (
      WHERE (updated_at AT TIME ZONE 'Asia/Kolkata')::date >= p_current_start
        AND (updated_at AT TIME ZONE 'Asia/Kolkata')::date < p_current_end
    ) AS earliest_current
  FROM app.campaigns
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND status = 'published'
),
categories AS (
  SELECT COALESCE(jsonb_agg(name ORDER BY name), '[]'::jsonb) AS value
  FROM (
    SELECT DISTINCT name FROM app.tenant_categories
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = true
    UNION SELECT 'Uncategorized'
  ) names
),
cohorts AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name), '[]'::jsonb) AS value
  FROM app.cohorts WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
),
top_performers AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'gmv_mtd', current_gmv) ORDER BY current_gmv DESC, id), '[]'::jsonb) AS value
  FROM (SELECT * FROM brand_rollup ORDER BY current_gmv DESC, id LIMIT 3) ranked
)
SELECT jsonb_build_object(
  'kpis', jsonb_build_object(
    'portfolio_gmv_mtd', portfolio.current_gmv,
    'brands_carried', CASE WHEN p_location_ids IS NULL
      THEN COALESCE((SELECT active_count FROM app.brands_snapshot WHERE tenant_id = p_tenant_id), (SELECT count(*) FROM visible_brands))
      ELSE (SELECT count(*) FROM visible_brands) END,
    'buyers_with_orders_mtd', buyer_counts.active_buyers,
    'total_buyers', buyer_counts.total_buyers,
    'catalog_freshness_count', catalog_stats.current_campaigns,
    'total_campaigns', catalog_stats.total_campaigns,
    'catalog_freshness_earliest_days', CASE WHEN catalog_stats.earliest_current IS NULL THEN NULL ELSE GREATEST(0, CURRENT_DATE - catalog_stats.earliest_current) END
  ),
  'todays_read', jsonb_build_object(
    'top_performers', top_performers.value
  ),
  'categories', categories.value,
  'cohorts', cohorts.value
)
FROM portfolio CROSS JOIN buyer_counts CROSS JOIN catalog_stats CROSS JOIN categories
CROSS JOIN cohorts CROSS JOIN top_performers;
$$;

-- =============================================================================
-- 6. app.get_seller_cohort_landing_aggregates
--    gmv_previous/growth_pct were a same-session no-op (see
--    20260723125928_drop_kpi_buyers_daily_v1_table.sql's header: gmv_previous
--    was hardcoded to 0 with no real previous-period source since
--    kpi_buyers_daily was dropped) -- removed now instead of left in place.
--    top_risers callout removed entirely. p_previous_start/p_previous_end_
--    exclusive are unused elsewhere in this function, so they're dropped too
--    -- signature shrinks from 8 to 6 params, so the old overload is dropped
--    first.
-- =============================================================================
DROP FUNCTION IF EXISTS app.get_seller_cohort_landing_aggregates(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb, boolean);

CREATE FUNCTION app.get_seller_cohort_landing_aggregates(
  p_tenant_id uuid,
  p_page_ids uuid[],
  p_current_start timestamptz,
  p_current_end_exclusive timestamptz,
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
  WITH demand_kind AS MATERIALIZED (
    SELECT app.metrics_v2_primary_demand_kind(p_tenant_id) AS kind
  ),
  page_ids AS MATERIALIZED (
    SELECT DISTINCT id
    FROM unnest((COALESCE(p_page_ids, ARRAY[]::uuid[]))[1:200]) AS ids(id)
  ),
  cohort_universe AS MATERIALIZED (
    SELECT c.id, c.name, c.created_at, COALESCE(c.cached_member_count, 0) AS cached_member_count
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ),
  relevant_cohorts AS MATERIALIZED (
    SELECT c.*
    FROM cohort_universe c
    WHERE p_include_summary OR c.id IN (SELECT id FROM page_ids)
  ),
  member_metrics AS MATERIALIZED (
    SELECT cm.cohort_id, count(DISTINCT cm.buyer_id)::bigint AS total_members
    FROM app.cohort_members_active cm
    JOIN relevant_cohorts c ON c.id = cm.cohort_id
    GROUP BY cm.cohort_id
  ),
  -- Current-membership rollup: sums each cohort's currently-active buyers' existing
  -- rolling-90d metrics_buyer_snapshot row, switching between order_* and estimate_*
  -- columns per the tenant's primary demand kind -- same pattern as Brands.
  cohort_buyer_metrics AS MATERIALIZED (
    SELECT cm.cohort_id,
      COALESCE(sum(CASE WHEN dk.kind = 'estimates' THEN bs.estimate_value_90d ELSE bs.order_value_90d END), 0)::numeric AS gmv_mtd,
      COALESCE(sum(CASE WHEN dk.kind = 'estimates' THEN bs.estimate_count_90d ELSE bs.order_count_90d END), 0)::bigint AS orders_mtd,
      count(DISTINCT bs.buyer_id) FILTER (
        WHERE (dk.kind = 'estimates' AND bs.estimate_count_90d > 0)
           OR (dk.kind <> 'estimates' AND bs.order_count_90d > 0)
      )::bigint AS active_members
    FROM app.cohort_members_active cm
    JOIN relevant_cohorts c ON c.id = cm.cohort_id
    JOIN app.metrics_buyer_snapshot bs ON bs.tenant_id = p_tenant_id AND bs.buyer_id = cm.buyer_id AND bs.deleted_at IS NULL
    CROSS JOIN demand_kind dk
    GROUP BY cm.cohort_id
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
      COALESCE(cbm.gmv_mtd, 0)::numeric AS gmv_mtd,
      COALESCE(cbm.orders_mtd, 0)::bigint AS orders_mtd,
      COALESCE(cbm.active_members, 0)::bigint AS active_members,
      COALESCE(mm.total_members, c.cached_member_count, 0)::bigint AS total_members,
      COALESCE(cam.live_catalogs_count, 0)::bigint AS live_catalogs_count,
      COALESCE(cv.catalog_views, (p_views_by_cohort ->> c.id::text)::bigint, 0)::numeric AS catalog_views
    FROM relevant_cohorts c
    LEFT JOIN member_metrics mm ON mm.cohort_id = c.id
    LEFT JOIN cohort_buyer_metrics cbm ON cbm.cohort_id = c.id
    LEFT JOIN campaign_metrics cam ON cam.cohort_id = c.id
    LEFT JOIN cohort_views cv ON cv.cohort_id = c.id
  ),
  enriched AS MATERIALIZED (
    SELECT
      rm.*,
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
            FROM app.cohort_members_active cm
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
        'avg_conversion_pct', sk.avg_conversion_pct,
        'uncategorised_buyers', bs.uncategorised_buyers
      ),
      'callout_metrics', jsonb_build_object(
        'low_conversion', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY conversion_pct, id) FROM (SELECT * FROM enriched ORDER BY conversion_pct, id) rows), '[]'::jsonb),
        'top_performers', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY gmv_mtd DESC, id) FROM (SELECT * FROM enriched ORDER BY gmv_mtd DESC, id) rows), '[]'::jsonb)
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

REVOKE ALL ON FUNCTION app.get_seller_cohort_landing_aggregates(uuid, uuid[], timestamptz, timestamptz, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_cohort_landing_aggregates(uuid, uuid[], timestamptz, timestamptz, jsonb, boolean) TO service_role;

-- =============================================================================
-- 7. app.metrics_v2_transaction_landing (p_kind = orders/estimates/invoices)
--    Removes total_estimates_growth_pct / orders_growth_pct /
--    invoices_growth_pct from all three branches of this shared function.
--    *_prev_period / *_prev_mtd fields stay -- they're kept as plain figures
--    (not a %, not "trend" framing) and nothing else in this migration reads
--    them. RETURNS jsonb, so no signature change -- CREATE OR REPLACE is safe.
-- =============================================================================
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
  v_current_start date := (p_as_of AT TIME ZONE 'Asia/Kolkata')::date - 89;
  v_current_end date := (p_as_of AT TIME ZONE 'Asia/Kolkata')::date + 1; -- exclusive
  v_previous_start date := ((p_as_of AT TIME ZONE 'Asia/Kolkata')::date - 89) - 90;
  v_previous_end date := (p_as_of AT TIME ZONE 'Asia/Kolkata')::date - 89; -- exclusive
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
        COALESCE(SUM(estimate_count) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(estimate_count) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_location_daily
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND day >= v_previous_start
        AND day < v_current_end
        AND deleted_at IS NULL;

      SELECT COALESCE(SUM(open_estimate_count), 0), COALESCE(SUM(open_estimate_value), 0)
      INTO v_open_count, v_open_value
      FROM app.metrics_location_snapshot
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND deleted_at IS NULL;
    ELSE
      SELECT
        COALESCE(SUM(estimate_count) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(estimate_count) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        COALESCE(SUM(estimate_value) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_daily
      WHERE tenant_id = p_tenant_id
        AND day >= v_previous_start
        AND day < v_current_end
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
      COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced') AND app.metric_day_ist(estimate_date, created_at) >= v_current_start AND app.metric_day_ist(estimate_date, created_at) < v_current_end)
    INTO v_one, v_two, v_three, v_four
    FROM app.estimates
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND (NOT v_location_scoped OR location_id = ANY (p_location_ids))
      AND (
        app.estimate_status_is_open(status)
        OR (app.metric_day_ist(estimate_date, created_at) >= v_current_start AND app.metric_day_ist(estimate_date, created_at) < v_current_end)
      );

    RETURN jsonb_build_object(
      'as_of', p_as_of,
      'table_period_owner', 'toolbar',
      'headline_period', 'trailing_90_days',
      'action_period', 'now',
      'commercial_horizon_days', 90,
      'source_watermark', v_source_watermark,
      'computed_at', v_computed_at,
      'kpis', jsonb_build_object(
        'total_estimates_this_period', v_current_count,
        'total_estimates_prev_period', v_prev_count,
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
        COALESCE(SUM(order_count) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(order_count) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_location_daily
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND day >= v_previous_start
        AND day < v_current_end
        AND deleted_at IS NULL;

      SELECT COALESCE(SUM(open_order_count), 0), COALESCE(SUM(open_order_value), 0)
      INTO v_open_count, v_open_value
      FROM app.metrics_location_snapshot
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND deleted_at IS NULL;
    ELSE
      SELECT
        COALESCE(SUM(order_count) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(order_count) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        COALESCE(SUM(order_value) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_daily
      WHERE tenant_id = p_tenant_id
        AND day >= v_previous_start
        AND day < v_current_end
        AND deleted_at IS NULL;

      SELECT open_order_count, open_order_value, GREATEST(source_watermark, v_source_watermark), GREATEST(computed_at, v_computed_at)
      INTO v_open_count, v_open_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_commercial_snapshot
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL;
    END IF;

    SELECT
      COUNT(DISTINCT buyer_id) FILTER (WHERE app.metric_day_ist(order_date, created_at) >= v_current_start AND app.metric_day_ist(order_date, created_at) < v_current_end AND app.order_status_in_flow(status)),
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
        OR (app.metric_day_ist(order_date, created_at) >= v_current_start AND app.metric_day_ist(order_date, created_at) < v_current_end)
      );

    RETURN jsonb_build_object(
      'as_of', p_as_of,
      'table_period_owner', 'toolbar',
      'headline_period', 'trailing_90_days',
      'action_period', 'now',
      'commercial_horizon_days', 90,
      'source_watermark', v_source_watermark,
      'computed_at', v_computed_at,
      'kpis', jsonb_build_object(
        'orders_mtd', v_current_count,
        'orders_prev_mtd', v_prev_count,
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
        COALESCE(SUM(invoice_count) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(invoice_count) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_location_daily
      WHERE tenant_id = p_tenant_id
        AND location_id = ANY (p_location_ids)
        AND day >= v_previous_start
        AND day < v_current_end
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
        COALESCE(SUM(invoice_count) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day >= v_current_start AND day < v_current_end), 0),
        COALESCE(SUM(invoice_count) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        COALESCE(SUM(invoice_value) FILTER (WHERE day >= v_previous_start AND day < v_previous_end), 0),
        MAX(source_watermark),
        MAX(computed_at)
      INTO v_current_count, v_current_value, v_prev_count, v_prev_value, v_source_watermark, v_computed_at
      FROM app.metrics_tenant_daily
      WHERE tenant_id = p_tenant_id
        AND day >= v_previous_start
        AND day < v_current_end
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
      'headline_period', 'trailing_90_days',
      'action_period', 'now',
      'commercial_horizon_days', 90,
      'source_watermark', v_source_watermark,
      'computed_at', v_computed_at,
      'kpis', jsonb_build_object(
        'invoices_this_period', v_current_count,
        'invoices_prev_period', v_prev_count,
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
