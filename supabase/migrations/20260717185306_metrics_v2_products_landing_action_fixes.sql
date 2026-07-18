-- Products landing, per specs/metrics-product-strategy-proposal-2026-07.md:
-- app.metrics_product_snapshot (populated by the Phase-3 refresh kernel) is
-- already invoice-line derived — this migration only fixes what the landing
-- RPC exposes/ranks, not the underlying data model:
--   - "Recently sold products now out of stock" was a raw out_of_stock count
--     with no join to recent sales — now requires units_90d > 0.
--   - "Products running low" action was merged with OOS into one
--     needs_attention list — split into its own action, ranked by lowest
--     days_cover among proven sellers (units_90d > 0), per the doc's
--     "ranked by" column.
--   - "Stock with no sale in 90 days" action didn't exist at all, despite
--     metrics_product_snapshot already tracking no_sale_since — added.
--   - top_performers/top_risers aren't in the doc's 3-action spec — dropped.
--   - subtitle needs brand_count/category_count; "Products that sold" needs
--     a real portfolio-wide count, not a client-computed one over the page.
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
    LIMIT 3
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
    LIMIT 3
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
    LIMIT 3
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

REVOKE ALL ON FUNCTION app.metrics_v2_products_landing(uuid, uuid[], text, text[], text[], text[], text[], integer, timestamptz, uuid, timestamptz) FROM PUBLIC;
