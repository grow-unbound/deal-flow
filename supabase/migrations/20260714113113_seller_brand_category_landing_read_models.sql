-- Bounded assistant-aware selection and row metrics for the seller brands landing.

CREATE OR REPLACE FUNCTION app.search_seller_brand_landing_page(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_cohort_ids uuid[] DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_current_start timestamptz DEFAULT NULL,
  p_current_end timestamptz DEFAULT NULL,
  p_previous_start timestamptz DEFAULT NULL,
  p_previous_end timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, catalog
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_prefix_text text;
BEGIN
  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);
    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
      INTO v_prefix_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
    IF v_prefix_text IS NOT NULL THEN
      v_prefix_ts_query := to_tsquery('english', v_prefix_text);
    END IF;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT tb.id, tb.created_at,
      CASE WHEN v_query IS NULL THEN 0::real ELSE GREATEST(
        ts_rank_cd(tb.search_vector, v_ts_query),
        COALESCE(ts_rank_cd(tb.search_vector, v_prefix_ts_query), 0)
      ) END AS search_rank
    FROM app.tenant_brands tb
    WHERE tb.tenant_id = p_tenant_id
      AND tb.deleted_at IS NULL
      AND tb.is_active = true
      AND (COALESCE(cardinality(p_cohort_ids), 0) = 0 OR tb.default_cohort_id = ANY(p_cohort_ids))
      AND (
        v_query IS NULL
        OR tb.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND tb.search_vector @@ v_prefix_ts_query)
      )
      AND (
        COALESCE(cardinality(p_category_names), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM app.tenant_products tp
          LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id AND tc.deleted_at IS NULL
          LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id AND cp.deleted_at IS NULL
          LEFT JOIN catalog.categories cc ON cc.id = cp.category_id AND cc.deleted_at IS NULL
          WHERE tp.tenant_id = p_tenant_id AND tp.tenant_brand_id = tb.id
            AND tp.deleted_at IS NULL AND tp.is_active = true
            AND (lower(tc.name) = ANY(p_category_names) OR lower(cc.name) = ANY(p_category_names))
        )
      )
      AND (
        p_location_ids IS NULL
        OR EXISTS (
          SELECT 1
          FROM app.tenant_products tp
          WHERE tp.tenant_id = p_tenant_id AND tp.tenant_brand_id = tb.id
            AND tp.deleted_at IS NULL AND tp.is_active = true
            AND (
              EXISTS (
                SELECT 1 FROM app.tenant_inventory ti
                JOIN app.warehouses w ON w.id = ti.warehouse_id AND w.tenant_id = p_tenant_id
                WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL AND w.deleted_at IS NULL
                  AND w.location_id = ANY(p_location_ids)
              )
              OR EXISTS (
                SELECT 1 FROM app.order_items oi
                JOIN app.orders o ON o.id = oi.order_id
                WHERE oi.tenant_product_id = tp.id AND oi.deleted_at IS NULL
                  AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
                  AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
                  AND (
                    (COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at) >= p_current_start AND COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at) < p_current_end)
                    OR (COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at) >= p_previous_start AND COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at) < p_previous_end)
                  )
              )
            )
        )
      )
  ), totals AS (SELECT count(*) AS total_count FROM candidates), page AS (
    SELECT candidates.id, candidates.created_at, candidates.search_rank
    FROM candidates
    ORDER BY candidates.search_rank DESC, candidates.created_at DESC, candidates.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    OFFSET LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000)
  )
  SELECT page.id, totals.total_count
  FROM totals LEFT JOIN page ON true
  ORDER BY page.search_rank DESC, page.created_at DESC, page.id;
END;
$$;

REVOKE ALL ON FUNCTION app.search_seller_brand_landing_page(uuid, text, text[], uuid[], uuid[], timestamptz, timestamptz, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.search_seller_brand_landing_page(uuid, text, text[], uuid[], uuid[], timestamptz, timestamptz, timestamptz, timestamptz, integer, integer) TO service_role;

-- Category landing read models are intentionally separate from the brand path above.
-- Page metrics are bounded to explicit category IDs; tenant-wide work runs only for
-- the optional first-page summary and returns compact aggregates/callouts.

CREATE OR REPLACE FUNCTION app.get_seller_category_landing_page_metrics_v1(
  p_tenant_id uuid,
  p_category_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date,
  p_velocity_start date
)
RETURNS TABLE(
  tenant_category_id uuid,
  active_sku_count bigint,
  oos_sku_count bigint,
  low_stock_sku_count bigint,
  brand_count bigint,
  gmv_current numeric,
  gmv_previous numeric,
  units_current bigint,
  buyers_current bigint,
  avg_days_cover numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
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
  ), inventory AS MATERIALIZED (
    SELECT
      p.id AS tenant_product_id,
      count(ti.id)::bigint AS inventory_rows,
      COALESCE(sum(ti.qty_available), 0)::numeric AS qty_available,
      COALESCE(max(ti.reorder_point), 0)::numeric AS reorder_point
    FROM products p
    LEFT JOIN app.tenant_inventory ti
      ON ti.tenant_product_id = p.id
      AND ti.deleted_at IS NULL
    GROUP BY p.id
  ), velocity AS MATERIALIZED (
    SELECT
      k.tenant_product_id,
      COALESCE(sum(k.units_sold), 0)::numeric AS units_sold
    FROM app.kpi_product_daily k
    JOIN products p ON p.id = k.tenant_product_id
    WHERE k.tenant_id = p_tenant_id
      AND k.deleted_at IS NULL
      AND k.day >= p_velocity_start
      AND k.day < CURRENT_DATE + 1
    GROUP BY k.tenant_product_id
  ), product_metrics AS (
    SELECT
      p.tenant_category_id,
      count(*)::bigint AS active_sku_count,
      count(*) FILTER (
        WHERE i.inventory_rows > 0 AND i.qty_available <= 0
      )::bigint AS oos_sku_count,
      count(*) FILTER (
        WHERE i.inventory_rows > 0
          AND i.qty_available > 0
          AND i.reorder_point > 0
          AND i.qty_available <= i.reorder_point
      )::bigint AS low_stock_sku_count,
      count(DISTINCT p.tenant_brand_id)::bigint AS brand_count,
      round(avg((i.qty_available * 30) / NULLIF(v.units_sold, 0)))::numeric AS avg_days_cover
    FROM products p
    LEFT JOIN inventory i ON i.tenant_product_id = p.id
    LEFT JOIN velocity v ON v.tenant_product_id = p.id
    GROUP BY p.tenant_category_id
  ), category_kpis AS (
    SELECT
      k.tenant_category_id,
      COALESCE(sum(k.gmv) FILTER (
        WHERE k.day >= p_current_start AND k.day < p_current_end_exclusive
      ), 0)::numeric AS gmv_current,
      COALESCE(sum(k.gmv) FILTER (
        WHERE k.day >= p_previous_start AND k.day < p_previous_end_exclusive
      ), 0)::numeric AS gmv_previous,
      COALESCE(sum(k.units_sold) FILTER (
        WHERE k.day >= p_current_start AND k.day < p_current_end_exclusive
      ), 0)::bigint AS units_current,
      COALESCE(sum(k.buyers_count) FILTER (
        WHERE k.day >= p_current_start AND k.day < p_current_end_exclusive
      ), 0)::bigint AS buyers_current
    FROM app.kpi_category_daily k
    JOIN requested r ON r.id = k.tenant_category_id
    WHERE k.tenant_id = p_tenant_id
      AND k.day >= LEAST(p_current_start, p_previous_start)
      AND k.day < GREATEST(p_current_end_exclusive, p_previous_end_exclusive)
    GROUP BY k.tenant_category_id
  )
  SELECT
    r.id,
    COALESCE(pm.active_sku_count, 0),
    COALESCE(pm.oos_sku_count, 0),
    COALESCE(pm.low_stock_sku_count, 0),
    COALESCE(pm.brand_count, 0),
    COALESCE(ck.gmv_current, 0),
    COALESCE(ck.gmv_previous, 0),
    COALESCE(ck.units_current, 0),
    COALESCE(ck.buyers_current, 0),
    pm.avg_days_cover
  FROM requested r
  LEFT JOIN product_metrics pm ON pm.tenant_category_id = r.id
  LEFT JOIN category_kpis ck ON ck.tenant_category_id = r.id;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_category_landing_summary_v1(
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
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH active_categories AS MATERIALIZED (
    SELECT tc.id, tc.name
    FROM app.tenant_categories tc
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND tc.is_active = true
  ), category_kpis AS MATERIALIZED (
    SELECT
      ac.id,
      ac.name,
      COALESCE(sum(k.gmv) FILTER (
        WHERE k.day >= p_current_start AND k.day < p_current_end_exclusive
      ), 0)::numeric AS gmv_current,
      COALESCE(sum(k.gmv) FILTER (
        WHERE k.day >= p_previous_start AND k.day < p_previous_end_exclusive
      ), 0)::numeric AS gmv_previous,
      COALESCE(sum(k.units_sold) FILTER (
        WHERE k.day >= p_current_start AND k.day < p_current_end_exclusive
      ), 0)::bigint AS units_current,
      COALESCE(sum(k.buyers_count) FILTER (
        WHERE k.day >= p_current_start AND k.day < p_current_end_exclusive
      ), 0)::bigint AS buyers_current
    FROM active_categories ac
    LEFT JOIN app.kpi_category_daily k
      ON k.tenant_id = p_tenant_id
      AND k.tenant_category_id = ac.id
      AND k.day >= LEAST(p_current_start, p_previous_start)
      AND k.day < GREATEST(p_current_end_exclusive, p_previous_end_exclusive)
    GROUP BY ac.id, ac.name
  ), active_products AS MATERIALIZED (
    SELECT tp.id, tp.tenant_category_id
    FROM app.tenant_products tp
    JOIN active_categories ac ON ac.id = tp.tenant_category_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND tp.is_active = true
  ), product_inventory AS MATERIALIZED (
    SELECT
      ap.id AS tenant_product_id,
      ap.tenant_category_id,
      count(ti.id)::bigint AS inventory_rows,
      COALESCE(sum(ti.qty_available), 0)::numeric AS qty_available,
      COALESCE(max(ti.reorder_point), 0)::numeric AS reorder_point
    FROM active_products ap
    LEFT JOIN app.tenant_inventory ti
      ON ti.tenant_product_id = ap.id
      AND ti.deleted_at IS NULL
    GROUP BY ap.id, ap.tenant_category_id
  ), stock_by_category AS MATERIALIZED (
    SELECT
      pi.tenant_category_id AS id,
      count(*) FILTER (
        WHERE pi.inventory_rows > 0 AND pi.qty_available <= 0
      )::bigint AS oos_sku_count,
      count(*) FILTER (
        WHERE pi.inventory_rows > 0
          AND pi.qty_available > 0
          AND pi.reorder_point > 0
          AND pi.qty_available <= pi.reorder_point
      )::bigint AS low_stock_sku_count
    FROM product_inventory pi
    GROUP BY pi.tenant_category_id
  ), totals AS (
    SELECT
      COALESCE(sum(ck.gmv_current), 0)::numeric AS total_gmv,
      COALESCE((SELECT cs.active_count FROM app.categories_snapshot cs WHERE cs.tenant_id = p_tenant_id), (SELECT count(*) FROM active_categories))::bigint AS active_count,
      COALESCE((SELECT cs.low_stock_count FROM app.categories_snapshot cs WHERE cs.tenant_id = p_tenant_id), 0)::bigint AS low_stock_count,
      COALESCE((SELECT cs.uncategorized_count FROM app.categories_snapshot cs WHERE cs.tenant_id = p_tenant_id), 0)::bigint AS uncategorized_count
    FROM category_kpis ck
  ), top_category AS (
    SELECT ck.id, ck.name, ck.gmv_current
    FROM category_kpis ck
    ORDER BY ck.gmv_current DESC, ck.name, ck.id
    LIMIT 1
  ), stockout_risk AS (
    SELECT ac.id, ac.name, sbc.oos_sku_count, sbc.low_stock_sku_count
    FROM stock_by_category sbc
    JOIN active_categories ac ON ac.id = sbc.id
    WHERE sbc.oos_sku_count > 0
    ORDER BY sbc.oos_sku_count DESC, sbc.low_stock_sku_count DESC, ac.id
    LIMIT 3
  ), top_performers AS (
    SELECT
      ck.id,
      ck.name,
      ck.gmv_current,
      CASE WHEN ck.gmv_previous > 0
        THEN round(((ck.gmv_current - ck.gmv_previous) / ck.gmv_previous) * 100)
        ELSE 0
      END::numeric AS growth_pct,
      ck.buyers_current
    FROM category_kpis ck
    WHERE ck.gmv_current > 0
    ORDER BY ck.gmv_current DESC, ck.id
    LIMIT 2
  ), fast_movers AS (
    SELECT
      ck.id,
      ck.name,
      ck.units_current,
      CASE WHEN ck.gmv_previous > 0
        THEN round(((ck.gmv_current - ck.gmv_previous) / ck.gmv_previous) * 100)
        ELSE 0
      END::numeric AS growth_pct
    FROM category_kpis ck
    WHERE ck.units_current > 0
    ORDER BY ck.units_current DESC, ck.id
    LIMIT 2
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_count', totals.active_count,
      'low_stock_count', totals.low_stock_count,
      'top_category_name', top_category.name,
      'top_category_share_pct', CASE WHEN totals.total_gmv > 0
        THEN round((COALESCE(top_category.gmv_current, 0) / totals.total_gmv) * 100)
        ELSE 0
      END,
      'uncategorized_count', totals.uncategorized_count
    ),
    'callouts', jsonb_build_object(
      'stockout_risk', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', row.id,
          'name', row.name,
          'oos_sku_count', row.oos_sku_count,
          'low_stock_sku_count', row.low_stock_sku_count
        ) ORDER BY row.oos_sku_count DESC, row.id)
        FROM stockout_risk AS row
      ), '[]'::jsonb),
      'top_performers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', row.id,
          'name', row.name,
          'gmv_mtd', row.gmv_current,
          'growth_pct', row.growth_pct,
          'buyers_count', row.buyers_current
        ) ORDER BY row.gmv_current DESC, row.id)
        FROM top_performers AS row
      ), '[]'::jsonb),
      'fast_movers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', row.id,
          'name', row.name,
          'units_mtd', row.units_current,
          'growth_pct', row.growth_pct
        ) ORDER BY row.units_current DESC, row.id)
        FROM fast_movers AS row
      ), '[]'::jsonb)
    )
  )
  FROM totals
  LEFT JOIN top_category ON true;
$$;

REVOKE ALL ON FUNCTION app.get_seller_category_landing_page_metrics_v1(uuid, uuid[], date, date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_seller_category_landing_summary_v1(uuid, date, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_category_landing_page_metrics_v1(uuid, uuid[], date, date, date, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_category_landing_summary_v1(uuid, date, date, date, date) TO service_role;

-- Hydrate only the selected landing page. The page-id cap is repeated here so a
-- caller cannot turn this internal read model into a tenant-wide request.
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
  SELECT sb.id, cm.cohort_id FROM scoped_buyers sb JOIN app.cohort_members cm ON cm.buyer_id = sb.id
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
    'gmv_prev_mtd', COALESCE(s.previous_gmv, 0),
    'growth_pct', CASE
      WHEN COALESCE(s.previous_gmv, 0) > 0 THEN round(((COALESCE(s.current_gmv, 0) - s.previous_gmv) / s.previous_gmv) * 100)
      WHEN COALESCE(s.current_gmv, 0) > 0 THEN 100 ELSE 0 END,
    'portfolio_share_pct', CASE WHEN pt.current_gmv > 0 THEN round(COALESCE(s.current_gmv, 0) / pt.current_gmv * 100) ELSE 0 END,
    'sku_count', COALESCE(pr.sku_count, 0),
    'active_buyers_mtd', COALESCE(s.active_buyers, 0),
    'total_buyers', COALESCE(ba.total_buyers, 0),
    'catalog_days_ago', CASE WHEN cr.latest_at IS NULL THEN NULL ELSE GREATEST(0, CURRENT_DATE - (cr.latest_at AT TIME ZONE 'Asia/Kolkata')::date) END,
    'categories', COALESCE(pr.categories, '["Uncategorized"]'::jsonb),
    'catalog_name', cr.latest_name,
    'alerts', to_jsonb(array_remove(ARRAY[
      CASE WHEN COALESCE(ir.low_stock_skus, 0) > 0 THEN 'low_stock' END,
      CASE WHEN COALESCE(s.current_gmv, 0) < COALESCE(s.previous_gmv, 0) THEN 'gmv_decline' END,
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

REVOKE ALL ON FUNCTION app.get_seller_brand_landing_rows(uuid, uuid[], uuid[], date, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_brand_landing_rows(uuid, uuid[], uuid[], date, date, date, date) TO service_role;

-- Return one compact summary object. Transaction metrics come from maintained
-- daily facts; relational scans are limited to filter options and bounded callouts.
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
WITH period_brand AS MATERIALIZED (
  SELECT k.tenant_brand_id,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::numeric AS current_gmv,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_previous_start AND k.day < p_previous_end), 0)::numeric AS previous_gmv
  FROM app.kpi_brand_daily k
  WHERE p_location_ids IS NULL AND k.tenant_id = p_tenant_id
    AND k.day >= LEAST(p_previous_start, p_current_start)
    AND k.day < GREATEST(p_previous_end, p_current_end)
  GROUP BY k.tenant_brand_id
  UNION ALL
  SELECT tp.tenant_brand_id,
    COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
    ), 0)::numeric,
    COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_previous_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_previous_end
    ), 0)::numeric
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
  JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
  WHERE p_location_ids IS NOT NULL AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
    AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
  GROUP BY tp.tenant_brand_id
),
visible_brands AS MATERIALIZED (
  SELECT tb.id, COALESCE(tb.display_name_override, cb.name, 'Unknown brand') AS name
  FROM app.tenant_brands tb
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id AND cb.deleted_at IS NULL
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
            OR EXISTS (
              SELECT 1 FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id
              WHERE oi.tenant_product_id = tp.id AND oi.deleted_at IS NULL
                AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
                AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
                AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
                AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
            )
          )
      )
    )
),
brand_rollup AS MATERIALIZED (
  SELECT vb.id, vb.name, COALESCE(pb.current_gmv, 0)::numeric AS current_gmv,
    COALESCE(pb.previous_gmv, 0)::numeric AS previous_gmv,
    CASE WHEN COALESCE(pb.previous_gmv, 0) > 0
      THEN round(((COALESCE(pb.current_gmv, 0) - pb.previous_gmv) / pb.previous_gmv) * 100)
      WHEN COALESCE(pb.current_gmv, 0) > 0 THEN 100 ELSE 0 END AS growth_pct,
    array_remove(ARRAY[
      CASE WHEN COALESCE(pb.current_gmv, 0) < COALESCE(pb.previous_gmv, 0) THEN 'gmv_decline' END
    ], NULL) AS alerts
  FROM visible_brands vb
  LEFT JOIN period_brand pb ON pb.tenant_brand_id = vb.id
),
portfolio AS (
  SELECT COALESCE(sum(current_gmv), 0)::numeric AS current_gmv,
    COALESCE(sum(previous_gmv), 0)::numeric AS previous_gmv FROM brand_rollup
),
buyer_counts AS (
  SELECT
    count(DISTINCT b.id)::bigint AS total_buyers,
    count(DISTINCT o.buyer_id) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
        AND app.order_status_in_flow(o.status)
    )::bigint AS active_buyers
  FROM app.buyers b
  LEFT JOIN app.orders o ON o.tenant_id = p_tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
    AND (p_location_ids IS NULL OR o.location_id = ANY(p_location_ids))
    AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
    AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
  WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    AND (
      p_location_ids IS NULL
      OR EXISTS (
        SELECT 1 FROM app.buyers_snapshot bs
        WHERE bs.tenant_id = p_tenant_id AND bs.buyer_id = b.id
          AND bs.scope = 'location' AND bs.location_id = ANY(p_location_ids)
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
needs_attention AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'growth_pct', growth_pct, 'alerts', to_jsonb(alerts)
  ) ORDER BY cardinality(alerts) DESC, current_gmv DESC, id) FILTER (WHERE seq <= 3), '[]'::jsonb) AS value,
  count(*) FILTER (WHERE cardinality(alerts) > 0)::bigint AS total
  FROM (SELECT br.*, row_number() OVER (ORDER BY cardinality(alerts) DESC, current_gmv DESC, id) AS seq
    FROM brand_rollup br WHERE cardinality(alerts) > 0) ranked
),
top_performers AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'gmv_mtd', current_gmv) ORDER BY current_gmv DESC, id), '[]'::jsonb) AS value
  FROM (SELECT * FROM brand_rollup ORDER BY current_gmv DESC, id LIMIT 3) ranked
),
top_risers AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'growth_pct', growth_pct,
    'gmv_mtd', current_gmv, 'gmv_prev_mtd', previous_gmv
  ) ORDER BY growth_pct DESC, current_gmv DESC, id), '[]'::jsonb) AS value
  FROM (SELECT * FROM brand_rollup ORDER BY growth_pct DESC, current_gmv DESC, id LIMIT 3) ranked
)
SELECT jsonb_build_object(
  'kpis', jsonb_build_object(
    'portfolio_gmv_mtd', portfolio.current_gmv,
    'portfolio_gmv_prev_mtd', portfolio.previous_gmv,
    'brands_carried', CASE WHEN p_location_ids IS NULL
      THEN COALESCE((SELECT active_count FROM app.brands_snapshot WHERE tenant_id = p_tenant_id), (SELECT count(*) FROM visible_brands))
      ELSE (SELECT count(*) FROM visible_brands) END,
    'buyers_with_orders_mtd', buyer_counts.active_buyers,
    'total_buyers', buyer_counts.total_buyers,
    'need_attention_count', needs_attention.total,
    'catalog_freshness_count', catalog_stats.current_campaigns,
    'total_campaigns', catalog_stats.total_campaigns,
    'catalog_freshness_earliest_days', CASE WHEN catalog_stats.earliest_current IS NULL THEN NULL ELSE GREATEST(0, CURRENT_DATE - catalog_stats.earliest_current) END
  ),
  'todays_read', jsonb_build_object(
    'needs_attention', needs_attention.value,
    'top_performers', top_performers.value,
    'top_risers', top_risers.value
  ),
  'categories', categories.value,
  'cohorts', cohorts.value
)
FROM portfolio CROSS JOIN buyer_counts CROSS JOIN catalog_stats CROSS JOIN categories
CROSS JOIN cohorts CROSS JOIN needs_attention CROSS JOIN top_performers CROSS JOIN top_risers;
$$;

REVOKE ALL ON FUNCTION app.get_seller_brand_landing_summary(uuid, uuid[], date, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_brand_landing_summary(uuid, uuid[], date, date, date, date) TO service_role;
