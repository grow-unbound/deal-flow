SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION app.search_buyer_app_access(
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
          FROM app.buyers_snapshot bs
          WHERE bs.tenant_id = p_tenant_id
            AND bs.buyer_id = b.id
            AND bs.scope = 'location'
            AND bs.location_id = ANY (p_location_ids)
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
    -- Apply every predicate that does not need order metrics before touching
    -- the 90-day order window. Suggested buyers must be disabled and inactive
    -- buyers must be enabled, which further narrows those derived segments.
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
    -- Name-sorted requests with no metric-derived filters can page first, so
    -- their order aggregation is bounded to the visible candidate buyers.
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
  buyers_to_aggregate AS MATERIALIZED (
    -- Authoritative summaries intentionally cover the full scoped population.
    SELECT rs.*
    FROM ranked_scoped rs
    WHERE v_include_summary

    UNION ALL

    -- Metric filters/sorts need all already-filtered candidates for exactness.
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
  order_metrics AS MATERIALIZED (
    SELECT
      ba.id AS buyer_id,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order), 0)::numeric AS app_gmv_90d,
      COALESCE(SUM(o.total_amount) FILTER (WHERE NOT o.is_buyer_app_order), 0)::numeric AS offline_spend_90d,
      MAX(COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at))
        FILTER (WHERE o.is_buyer_app_order) AS last_app_order_at,
      COUNT(*) FILTER (
        WHERE o.is_buyer_app_order
          AND COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at) >= v_30d_ago
      )::bigint AS app_orders_30d
    FROM buyers_to_aggregate ba
    LEFT JOIN app.orders o
      ON o.tenant_id = p_tenant_id
     AND o.buyer_id = ba.id
     AND COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at) >= v_90d_ago
     AND o.deleted_at IS NULL
     AND app.order_status_in_flow(o.status)
     AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
    GROUP BY ba.id
  ),
  enriched AS MATERIALIZED (
    SELECT
      ba.id,
      ba.business_name,
      ba.contact_name,
      ba.phone,
      NULLIF(ba.geography ->> 'city', '') AS city,
      NULLIF(ba.geography ->> 'state', '') AS state,
      ba.buyer_app_enabled,
      om.last_app_order_at,
      om.offline_spend_90d,
      (om.offline_spend_90d + om.app_gmv_90d)::numeric AS total_spend_90d,
      om.app_gmv_90d,
      (NOT ba.buyer_app_enabled AND om.offline_spend_90d > 0) AS is_suggested,
      (ba.buyer_app_enabled AND om.app_orders_30d = 0) AS is_inactive,
      ba.search_rank,
      ba.search_vector
    FROM buyers_to_aggregate ba
    JOIN order_metrics om ON om.buyer_id = ba.id
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

REVOKE ALL ON FUNCTION app.search_buyer_app_access(uuid, text, text, text, text, uuid[], integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_buyer_app_access(uuid, text, text, text, text, uuid[], integer, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION app.search_buyer_app_access(uuid, text, text, text, text, uuid[], integer, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_buyer_app_access(uuid, text, text, text, text, uuid[], integer, integer, boolean) TO service_role;
