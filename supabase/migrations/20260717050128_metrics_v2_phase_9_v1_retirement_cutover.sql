SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION app.search_buyer_app_access_v2(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_segment text DEFAULT 'all',
  p_last_ordered text DEFAULT 'all',
  p_sort text DEFAULT 'business_name',
  p_location_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_include_summary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_query_text text;
  v_prefix_ts_query tsquery;
  v_segment text := lower(btrim(COALESCE(p_segment, 'all')));
  v_last_ordered text := lower(btrim(COALESCE(p_last_ordered, 'all')));
  v_sort text := lower(btrim(COALESCE(p_sort, 'business_name')));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
  v_include_summary boolean := COALESCE(p_include_summary, false);
  v_requires_metric_candidates boolean;
  v_30d_ago timestamptz := now() - interval '30 days';
  v_90d_ago timestamptz := now() - interval '90 days';
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_segment NOT IN ('all', 'enabled', 'disabled', 'suggested', 'inactive') THEN
    RAISE EXCEPTION 'invalid_segment' USING ERRCODE = '22023';
  END IF;

  IF v_last_ordered NOT IN ('all', '30d', '90d', 'dormant') THEN
    RAISE EXCEPTION 'invalid_last_ordered' USING ERRCODE = '22023';
  END IF;

  IF v_sort NOT IN ('business_name', 'app_gmv', 'offline_spend', 'last_ordered') THEN
    RAISE EXCEPTION 'invalid_sort' USING ERRCODE = '22023';
  END IF;

  v_requires_metric_candidates :=
    v_segment IN ('suggested', 'inactive')
    OR v_last_ordered <> 'all'
    OR v_sort <> 'business_name';

  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);

    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_query_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

    IF v_prefix_query_text IS NOT NULL THEN
      v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
    END IF;
  END IF;

  WITH scoped_buyers AS MATERIALIZED (
    SELECT
      b.id,
      b.business_name,
      b.contact_name,
      b.phone,
      b.geography,
      b.buyer_app_enabled,
      b.search_vector
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND (
        p_location_ids IS NULL
        OR EXISTS (
          SELECT 1
          FROM app.metrics_buyer_location_snapshot bls
          WHERE bls.tenant_id = p_tenant_id
            AND bls.buyer_id = b.id
            AND bls.location_id = ANY (p_location_ids)
            AND bls.deleted_at IS NULL
        )
      )
  ),
  ranked_scoped AS MATERIALIZED (
    SELECT
      sb.*,
      CASE
        WHEN v_query IS NULL THEN 0::real
        WHEN sb.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(sb.search_vector, v_ts_query)
        ELSE ts_rank_cd(sb.search_vector, v_prefix_ts_query)
      END AS search_rank
    FROM scoped_buyers sb
  ),
  candidate_pool AS MATERIALIZED (
    SELECT rs.*
    FROM ranked_scoped rs
    WHERE (
        v_query IS NULL
        OR rs.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND rs.search_vector @@ v_prefix_ts_query)
      )
      AND CASE v_segment
        WHEN 'enabled' THEN rs.buyer_app_enabled
        WHEN 'disabled' THEN NOT rs.buyer_app_enabled
        WHEN 'suggested' THEN NOT rs.buyer_app_enabled
        WHEN 'inactive' THEN rs.buyer_app_enabled
        ELSE true
      END
  ),
  cheap_page AS MATERIALIZED (
    SELECT cp.*
    FROM candidate_pool cp
    WHERE NOT v_include_summary
      AND NOT v_requires_metric_candidates
    ORDER BY
      CASE WHEN v_query IS NOT NULL THEN cp.search_rank END DESC NULLS LAST,
      cp.business_name ASC,
      cp.id ASC
    LIMIT v_limit
    OFFSET v_offset
  ),
  buyers_to_enrich AS MATERIALIZED (
    SELECT rs.*
    FROM ranked_scoped rs
    WHERE v_include_summary

    UNION ALL

    SELECT cp.*
    FROM candidate_pool cp
    WHERE NOT v_include_summary
      AND v_requires_metric_candidates

    UNION ALL

    SELECT cp.*
    FROM cheap_page cp
    WHERE NOT v_include_summary
      AND NOT v_requires_metric_candidates
  ),
  enriched AS MATERIALIZED (
    SELECT
      bte.id,
      bte.business_name,
      bte.contact_name,
      bte.phone,
      NULLIF(bte.geography ->> 'city', '') AS city,
      NULLIF(bte.geography ->> 'state', '') AS state,
      bte.buyer_app_enabled,
      mbs.last_buyer_app_activity_at AS last_app_order_at,
      GREATEST(COALESCE(mbs.invoice_value_90d, 0) - COALESCE(mbs.app_invoice_value_90d, 0), 0)::numeric AS offline_spend_90d,
      COALESCE(mbs.invoice_value_90d, 0)::numeric AS total_spend_90d,
      COALESCE(mbs.app_invoice_value_90d, 0)::numeric AS app_gmv_90d,
      (NOT bte.buyer_app_enabled AND COALESCE(mbs.invoice_value_90d, 0) - COALESCE(mbs.app_invoice_value_90d, 0) > 0) AS is_suggested,
      (
        bte.buyer_app_enabled
        AND (
          mbs.last_buyer_app_activity_at IS NULL
          OR mbs.last_buyer_app_activity_at < v_30d_ago
        )
      ) AS is_inactive,
      bte.search_rank,
      bte.search_vector
    FROM buyers_to_enrich bte
    LEFT JOIN app.metrics_buyer_snapshot mbs
      ON mbs.tenant_id = p_tenant_id
      AND mbs.buyer_id = bte.id
      AND mbs.deleted_at IS NULL
  ),
  kpis AS (
    SELECT
      COUNT(*) FILTER (WHERE buyer_app_enabled)::bigint AS enabled_count,
      COUNT(*) FILTER (WHERE NOT buyer_app_enabled)::bigint AS not_enabled_count,
      COUNT(*) FILTER (WHERE is_suggested)::bigint AS suggested_count,
      COUNT(*) FILTER (WHERE is_inactive)::bigint AS inactive_count,
      COUNT(*)::bigint AS total_count
    FROM enriched
  ),
  filtered AS MATERIALIZED (
    SELECT e.*
    FROM enriched e
    WHERE (
        v_query IS NULL
        OR e.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND e.search_vector @@ v_prefix_ts_query)
      )
      AND CASE v_segment
        WHEN 'enabled' THEN e.buyer_app_enabled
        WHEN 'disabled' THEN NOT e.buyer_app_enabled
        WHEN 'suggested' THEN e.is_suggested
        WHEN 'inactive' THEN e.is_inactive
        ELSE true
      END
      AND CASE v_last_ordered
        WHEN '30d' THEN e.last_app_order_at >= v_30d_ago
        WHEN '90d' THEN e.last_app_order_at >= v_90d_ago
        WHEN 'dormant' THEN e.last_app_order_at IS NULL OR e.last_app_order_at < v_90d_ago
        ELSE true
      END
  ),
  filtered_count AS (
    SELECT CASE
      WHEN NOT v_include_summary AND NOT v_requires_metric_candidates
        THEN (SELECT COUNT(*)::bigint FROM candidate_pool)
      ELSE (SELECT COUNT(*)::bigint FROM filtered)
    END AS value
  ),
  page AS MATERIALIZED (
    SELECT f.*
    FROM filtered f
    ORDER BY
      CASE WHEN v_query IS NOT NULL THEN f.search_rank END DESC NULLS LAST,
      CASE WHEN v_sort = 'app_gmv' THEN f.app_gmv_90d END DESC NULLS LAST,
      CASE WHEN v_sort = 'offline_spend' THEN f.offline_spend_90d END DESC NULLS LAST,
      CASE WHEN v_sort = 'last_ordered' THEN f.last_app_order_at END DESC NULLS LAST,
      f.business_name ASC,
      f.id ASC
    LIMIT v_limit
    OFFSET CASE
      WHEN NOT v_include_summary AND NOT v_requires_metric_candidates THEN 0
      ELSE v_offset
    END
  )
  SELECT jsonb_build_object(
    'summary_authoritative', v_include_summary,
    'kpis', CASE
      WHEN v_include_summary THEN jsonb_build_object(
        'enabled_count', k.enabled_count,
        'not_enabled_count', k.not_enabled_count,
        'suggested_count', k.suggested_count,
        'inactive_count', k.inactive_count,
        'total_count', k.total_count
      )
      ELSE NULL
    END,
    'buyers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'business_name', p.business_name,
          'contact_name', p.contact_name,
          'phone', p.phone,
          'city', p.city,
          'state', p.state,
          'buyer_app_enabled', p.buyer_app_enabled,
          'last_app_order_at', p.last_app_order_at,
          'offline_spend_90d', p.offline_spend_90d,
          'total_spend_90d', p.total_spend_90d,
          'app_gmv_90d', p.app_gmv_90d,
          'is_suggested', p.is_suggested,
          'is_inactive', p.is_inactive
        )
        ORDER BY
          CASE WHEN v_query IS NOT NULL THEN p.search_rank END DESC NULLS LAST,
          CASE WHEN v_sort = 'app_gmv' THEN p.app_gmv_90d END DESC NULLS LAST,
          CASE WHEN v_sort = 'offline_spend' THEN p.offline_spend_90d END DESC NULLS LAST,
          CASE WHEN v_sort = 'last_ordered' THEN p.last_app_order_at END DESC NULLS LAST,
          p.business_name ASC,
          p.id ASC
      )
      FROM page p
    ), '[]'::jsonb),
    'filtered_count', fc.value,
    'has_more', (v_offset + v_limit) < fc.value,
    'limit', v_limit,
    'offset', v_offset
  )
  INTO v_result
  FROM kpis k
  CROSS JOIN filtered_count fc;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION app.search_buyer_app_access_v2(uuid, text, text, text, text, uuid[], integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_buyer_app_access_v2(uuid, text, text, text, text, uuid[], integer, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION app.search_buyer_app_access_v2(uuid, text, text, text, text, uuid[], integer, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_buyer_app_access_v2(uuid, text, text, text, text, uuid[], integer, integer, boolean) TO service_role;

CREATE OR REPLACE FUNCTION app.get_seller_category_landing_page_metrics_v2(
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
      SUM(CASE WHEN app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start AND app.metric_day_ist(i.invoice_date, i.created_at) < p_previous_end_exclusive THEN COALESCE(ii.line_total, 0) ELSE 0 END) AS gmv_previous,
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
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_previous_start
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
    COALESCE(vm.gmv_previous, 0),
    COALESCE(vm.units_current, 0),
    COALESCE(vm.buyers_current, 0),
    im.avg_days_cover
  FROM requested r
  LEFT JOIN inventory_metrics im ON im.tenant_category_id = r.id
  LEFT JOIN invoice_metrics vm ON vm.tenant_category_id = r.id;
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
    LIMIT 3
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
    LIMIT 3
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
    LIMIT 3
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

REVOKE ALL ON FUNCTION app.get_seller_category_landing_page_metrics_v2(uuid, uuid[], date, date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_seller_category_landing_summary_v2(uuid, date, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_category_landing_page_metrics_v2(uuid, uuid[], date, date, date, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_category_landing_summary_v2(uuid, date, date, date, date) TO service_role;
