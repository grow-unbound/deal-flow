-- Phase 2 part C: search_buyer_app_access_v2 -- the last of the 4 live v2
-- readers. Drops metrics_buyer_snapshot (buyer 90d rolling metrics) and
-- metrics_buyer_location_snapshot (buyer<->location membership), per
-- explicit owner instruction: v4 does not do rolling 90d windows anymore
-- ("customer feedback") -- only day/week/month/quarter grains in
-- metrics_*_period_summary. This function moves to:
--   - location membership: was a stored buyer<->location snapshot row,
--     now a live EXISTS against app.invoices (the same source the old
--     snapshot was itself built from for this buyer's location scope).
--   - invoice_value_90d / app_invoice_value_90d ("offline spend" /
--     "app GMV"): were rolling 90d SUMs, now current-month figures off
--     app.metrics_buyer_period_summary (grain='month'). App-attribution
--     shifts from "invoices flagged is_buyer_app_invoice" (a field v4
--     never tracked) to "app_order_value + app_estimate_value" -- the
--     same app-demand definition already used tenant-wide by the v4 tick
--     (metrics_tenant_period_summary.app_order_value/app_estimate_value).
--   - last_buyer_app_activity_at: now app.metrics_buyer_now_summary's new
--     column (point-in-time, added + backfilled in the schema-additions
--     migration earlier in this phase) instead of the old snapshot field.
--
-- NOTE: response JSON keys (offline_spend_90d/total_spend_90d/
-- app_gmv_90d) are left as-is to avoid an uncoordinated API break --
-- app/api/tenant/buyer-app/access/route.ts and its frontend consumer read
-- these key names. They now hold month-to-date figures, not 90d rolling
-- ones; renaming the keys is a separate FE+BE coordinated change, flagged
-- to the owner, not done here.
CREATE OR REPLACE FUNCTION app.search_buyer_app_access_v2(p_tenant_id uuid, p_query text DEFAULT NULL::text, p_segment text DEFAULT 'all'::text, p_last_ordered text DEFAULT 'all'::text, p_sort text DEFAULT 'business_name'::text, p_location_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_summary boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
AS $function$
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
  v_month_start date := date_trunc('month', now())::date;
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
          FROM app.invoices i
          WHERE i.tenant_id = p_tenant_id
            AND i.buyer_id = b.id
            AND i.location_id = ANY (p_location_ids)
            AND i.deleted_at IS NULL
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
      mbn.last_buyer_app_activity_at AS last_app_order_at,
      GREATEST(COALESCE(mbp.invoice_value, 0) - (COALESCE(mbp.app_order_value, 0) + COALESCE(mbp.app_estimate_value, 0)), 0)::numeric AS offline_spend_90d,
      COALESCE(mbp.invoice_value, 0)::numeric AS total_spend_90d,
      (COALESCE(mbp.app_order_value, 0) + COALESCE(mbp.app_estimate_value, 0))::numeric AS app_gmv_90d,
      (NOT bte.buyer_app_enabled AND COALESCE(mbp.invoice_value, 0) - (COALESCE(mbp.app_order_value, 0) + COALESCE(mbp.app_estimate_value, 0)) > 0) AS is_suggested,
      (
        bte.buyer_app_enabled
        AND (
          mbn.last_buyer_app_activity_at IS NULL
          OR mbn.last_buyer_app_activity_at < v_30d_ago
        )
      ) AS is_inactive,
      bte.search_rank,
      bte.search_vector
    FROM buyers_to_enrich bte
    LEFT JOIN app.metrics_buyer_now_summary mbn
      ON mbn.tenant_id = p_tenant_id
      AND mbn.buyer_id = bte.id
      AND mbn.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary mbp
      ON mbp.tenant_id = p_tenant_id
      AND mbp.buyer_id = bte.id
      AND mbp.grain = 'month'
      AND mbp.period_start = v_month_start
      AND mbp.deleted_at IS NULL
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
$function$;
