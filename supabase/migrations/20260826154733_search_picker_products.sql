-- New RPC: app.search_picker_products -- the single shared product-picker query for the
-- Pricelist and Campaign product search-overlay pickers (mirrors app.search_cohort_composer_buyers
-- for buyers). Deliberately NOT an extension of app.search_products_scoped: that RPC is a
-- security-sensitive, buyer-facing-storefront-scoped function (p_buyer_id/p_price_list_id/
-- p_campaign_id/brand-visibility fencing) with its own window-function pagination -- layering
-- metrics-based row filtering on top of its already-paginated output would shrink pages after
-- the fact and break infinite-scroll cursor consistency. Also deliberately NOT extending
-- app.get_catalog_composer_product_metrics -- that function does raw ad-hoc aggregation over
-- app.order_items/app.orders, the exact anti-pattern this feature is required to avoid. That
-- function stays in place (untouched) because its only caller, /api/tenant/catalogs/composer/products,
-- is also shared by CatalogComposer.tsx's merchandising grid (freshness tags, stock tone) --
-- out of scope for this picker-overlay task. This RPC instead backs a new, dedicated
-- picker-only route so the merchandising grid's data path is not touched.
--
-- Only reads from: app.tenant_products (+ catalog.products/app.tenant_brands/catalog.brands/
-- app.tenant_categories as pure dimension lookups, same join shape as search_products_scoped),
-- app.tenant_inventory (SUM per product across warehouses -- the correct replacement for the
-- legacy metrics_product_snapshot anti-pattern still used by app.get_landing_metrics_v4), and
-- app.metrics_product_period_summary (current + previous quarter).
--
-- Stock threshold: per-product effective low-stock threshold = the product's own summed
-- reorder_point across warehouses when set/nonzero, else p_default_low_stock_threshold (10).
-- Both the selling_low_stock quick filter and the Stock advanced dropdown use this same
-- effective threshold so they never visually contradict each other.
--
-- enquire_no_sales reads estimate_value/order_value directly -- metrics_product_period_summary
-- has no primary_demand_value column, so this is the only correct source (see companion note
-- in the buyer RPC migration for why buyers use the same two columns instead of
-- primary_demand_value).
--
-- top20 uses percent_rank() over the active-this-quarter (invoice_value > 0) universe, computed
-- as a separate CTE left-joined onto the filtered set, same technique as the buyer RPC.

CREATE FUNCTION app.search_picker_products(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL,
  p_brand_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_stock_bucket text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_quick_filters text[] DEFAULT NULL,
  p_quarter_start date DEFAULT date_trunc('quarter', CURRENT_DATE)::date,
  p_prev_quarter_start date DEFAULT (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date,
  p_default_low_stock_threshold integer DEFAULT 10,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  tenant_product_id uuid,
  display_name text,
  internal_sku text,
  brand_id uuid,
  brand_name text,
  category_id uuid,
  category_name text,
  mrp numeric,
  base_selling_price numeric,
  cost_price numeric,
  qty_available numeric,
  invoice_value numeric,
  invoice_units numeric,
  invoice_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_query_text text;
  v_prefix_ts_query tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_quarter_start date := COALESCE(p_quarter_start, date_trunc('quarter', CURRENT_DATE)::date);
  v_prev_quarter_start date := COALESCE(p_prev_quarter_start, (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date);
  v_ids uuid[] := CASE WHEN COALESCE(cardinality(p_ids), 0) = 0 THEN NULL ELSE p_ids[1:250] END;
  v_default_threshold integer := GREATEST(COALESCE(p_default_low_stock_threshold, 10), 1);
  v_want_top20 boolean := 'top20' = ANY (COALESCE(p_quick_filters, ARRAY[]::text[]));
  v_want_inactive boolean := COALESCE(p_status = 'inactive', false);
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  IF v_ids IS NULL AND v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);

    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_query_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

    IF v_prefix_query_text IS NOT NULL THEN
      v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
    END IF;
  END IF;

  RETURN QUERY
  WITH inventory AS MATERIALIZED (
    SELECT
      ti.tenant_product_id,
      SUM(COALESCE(ti.qty_available, 0))::numeric AS qty_available_total,
      SUM(COALESCE(ti.reorder_point, 0))::numeric AS reorder_point_total
    FROM app.tenant_inventory ti
    WHERE ti.deleted_at IS NULL
    GROUP BY ti.tenant_product_id
  ),
  eligible_products AS MATERIALIZED (
    SELECT
      tp.id,
      COALESCE(tp.name_override, cp.name, tp.internal_sku) AS display_name,
      tp.internal_sku,
      tp.tenant_brand_id AS brand_id,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS brand_name,
      tp.tenant_category_id AS category_id,
      COALESCE(tc.name, '') AS category_name,
      COALESCE(tp.mrp, 0) AS mrp,
      tp.base_selling_price,
      tp.cost_price,
      COALESCE(inv.qty_available_total, 0) AS qty_available_total,
      COALESCE(NULLIF(inv.reorder_point_total, 0), v_default_threshold) AS effective_threshold,
      CASE
        WHEN v_ids IS NOT NULL THEN 0::double precision
        WHEN v_query IS NULL THEN 0::double precision
        WHEN tp.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(tp.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(tp.search_vector, v_prefix_ts_query)::double precision
      END AS search_rank
    FROM app.tenant_products tp
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc
      ON tc.id = tp.tenant_category_id
     AND tc.tenant_id = p_tenant_id
     AND tc.deleted_at IS NULL
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND (tp.is_active = NOT v_want_inactive)
      AND (
        v_ids IS NOT NULL AND tp.id = ANY (v_ids)
        OR (
          v_ids IS NULL
          AND (p_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_brand_ids))
          AND (p_category_ids IS NULL OR tp.tenant_category_id = ANY (p_category_ids))
          AND (
            v_query IS NULL
            OR tp.search_vector @@ v_ts_query
            OR (v_prefix_ts_query IS NOT NULL AND tp.search_vector @@ v_prefix_ts_query)
          )
        )
      )
  ),
  filtered AS MATERIALIZED (
    SELECT
      ep.*,
      COALESCE(mps.invoice_value, 0) AS invoice_value,
      COALESCE(mps.invoice_units, 0) AS invoice_units,
      COALESCE(mps.invoice_count, 0) AS invoice_count,
      COALESCE(mps_prev.invoice_value, 0) AS prev_invoice_value,
      COALESCE(mps.estimate_value, 0) AS estimate_value,
      COALESCE(mps.order_value, 0) AS order_value
    FROM eligible_products ep
    LEFT JOIN app.metrics_product_period_summary mps
      ON mps.tenant_id = p_tenant_id
     AND mps.tenant_product_id = ep.id
     AND mps.grain = 'quarter'
     AND mps.period_start = v_quarter_start
     AND mps.deleted_at IS NULL
    LEFT JOIN app.metrics_product_period_summary mps_prev
      ON mps_prev.tenant_id = p_tenant_id
     AND mps_prev.tenant_product_id = ep.id
     AND mps_prev.grain = 'quarter'
     AND mps_prev.period_start = v_prev_quarter_start
     AND mps_prev.deleted_at IS NULL
    WHERE v_ids IS NOT NULL
      OR (
        (
          p_stock_bucket IS NULL
          OR (p_stock_bucket = 'in_stock' AND ep.qty_available_total >= ep.effective_threshold)
          OR (p_stock_bucket = 'low_stock' AND ep.qty_available_total > 0 AND ep.qty_available_total < ep.effective_threshold)
          OR (p_stock_bucket = 'out_of_stock' AND ep.qty_available_total = 0)
        )
        AND (
          p_status IS NULL
          OR p_status = 'inactive'
          OR (p_status = 'active' AND COALESCE(mps.invoice_value, 0) > 0)
          OR (p_status = 'dormant' AND COALESCE(mps.invoice_value, 0) = 0 AND COALESCE(mps_prev.invoice_value, 0) > 0)
        )
        AND (
          COALESCE(cardinality(p_quick_filters), 0) = 0
          OR (
            (
              'selling_oos' = ANY (p_quick_filters)
              AND COALESCE(mps.invoice_value, 0) > 0
              AND ep.qty_available_total = 0
            )
            OR (
              'selling_low_stock' = ANY (p_quick_filters)
              AND COALESCE(mps.invoice_value, 0) > 0
              AND ep.qty_available_total < ep.effective_threshold
            )
            OR ('selling_qtr' = ANY (p_quick_filters) AND COALESCE(mps.invoice_value, 0) > 0)
            OR (
              'not_selling_qtr' = ANY (p_quick_filters)
              AND COALESCE(mps.invoice_value, 0) = 0
              AND COALESCE(mps_prev.invoice_value, 0) > 0
            )
            OR (
              'enquire_no_sales' = ANY (p_quick_filters)
              AND (COALESCE(mps.estimate_value, 0) > 0 OR COALESCE(mps.order_value, 0) > 0)
              AND COALESCE(mps.invoice_value, 0) = 0
            )
            OR ('top20' = ANY (p_quick_filters) AND COALESCE(mps.invoice_value, 0) > 0)
          )
        )
      )
  ),
  gmv_rank AS MATERIALIZED (
    SELECT f.id, percent_rank() OVER (ORDER BY f.invoice_value DESC) AS pct_rank
    FROM filtered f
    WHERE f.invoice_value > 0
  ),
  paged AS MATERIALIZED (
    SELECT f.*, count(*) OVER () AS result_count
    FROM filtered f
    LEFT JOIN gmv_rank gr ON gr.id = f.id
    WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
    ORDER BY f.search_rank DESC, f.display_name ASC, f.id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    p.id,
    p.display_name,
    p.internal_sku,
    p.brand_id,
    p.brand_name,
    p.category_id,
    p.category_name,
    p.mrp,
    p.base_selling_price,
    p.cost_price,
    p.qty_available_total,
    p.invoice_value,
    p.invoice_units,
    p.invoice_count,
    p.result_count
  FROM paged p
  ORDER BY p.search_rank DESC, p.display_name ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION app.search_picker_products(
  uuid, text, uuid[], uuid[], uuid[], text, text, text[], date, date, integer, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_picker_products(
  uuid, text, uuid[], uuid[], uuid[], text, text, text[], date, date, integer, integer, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_picker_products(
  uuid, text, uuid[], uuid[], uuid[], text, text, text[], date, date, integer, integer, integer
) TO service_role;

COMMENT ON FUNCTION app.search_picker_products(
  uuid, text, uuid[], uuid[], uuid[], text, text, text[], date, date, integer, integer, integer
) IS 'Shared product-picker RPC for Price List and Campaign Add/Edit forms. v4-only sourcing (app.tenant_products, app.tenant_inventory, app.metrics_product_period_summary) -- deliberately separate from the buyer-facing app.search_products_scoped and from app.get_catalog_composer_product_metrics (raw order_items/orders aggregation, kept in place only for the out-of-scope CatalogComposer merchandising grid). See picker filter definitions in src/lib/picker-filters.ts.';
