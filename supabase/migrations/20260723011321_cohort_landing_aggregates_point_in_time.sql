-- app.get_seller_cohort_landing_aggregates attributed each buyer's historical daily GMV
-- (from app.kpi_buyers_daily, itself correctly date-windowed) to whichever cohort the buyer
-- is a CURRENT member of, not whichever cohort they were in on that historical day. Now that
-- app.cohort_members carries valid_from/valid_until (SCD2), rewrite attribution to be
-- per-buyer-per-day: a buyer's GMV on a given day attributes to the cohort they were actively
-- in on that day. "Current members right now" tiles (target_buyers, member_metrics,
-- buyer_summary) are unaffected -- those correctly stay current-snapshot, now via
-- app.cohort_members_active.

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
    FROM app.cohort_members_active cm
    JOIN cohort_universe c ON c.id = cm.cohort_id
    WHERE p_include_summary OR cm.cohort_id IN (SELECT id FROM page_ids)
  ),
  relevant_cohorts AS MATERIALIZED (
    SELECT c.*
    FROM cohort_universe c
    WHERE p_include_summary OR c.id IN (SELECT id FROM page_ids)
  ),
  -- Point-in-time attribution: for each (buyer, day) with kpi activity in the window we care
  -- about, find whichever cohort that buyer was actively in on that specific day (not today).
  attributed_members_by_day AS MATERIALIZED (
    SELECT DISTINCT ON (k.buyer_id, k.day) k.buyer_id, k.day, cm.cohort_id
    FROM app.kpi_buyers_daily k
    JOIN target_buyers tb ON tb.buyer_id = k.buyer_id
    JOIN app.cohort_members cm ON cm.buyer_id = k.buyer_id
      AND (cm.valid_from AT TIME ZONE 'Asia/Kolkata')::date <= k.day
      AND (cm.valid_until IS NULL OR (cm.valid_until AT TIME ZONE 'Asia/Kolkata')::date > k.day)
    JOIN relevant_cohorts c ON c.id = cm.cohort_id
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.location_id IS NULL
      AND k.day >= (p_previous_start AT TIME ZONE 'Asia/Kolkata')::date
      AND k.day < (p_current_end_exclusive AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY k.buyer_id, k.day, c.created_at DESC, c.id
  ),
  member_metrics AS MATERIALIZED (
    SELECT cm.cohort_id, count(DISTINCT cm.buyer_id)::bigint AS total_members
    FROM app.cohort_members_active cm
    JOIN relevant_cohorts c ON c.id = cm.cohort_id
    GROUP BY cm.cohort_id
  ),
  current_metrics AS MATERIALIZED (
    SELECT
      amd.cohort_id,
      COALESCE(sum(k.orders_gmv), 0)::numeric AS gmv_mtd,
      COALESCE(sum(k.orders_count), 0)::bigint AS orders_mtd,
      count(DISTINCT k.buyer_id) FILTER (WHERE k.orders_count > 0)::bigint AS active_members
    FROM app.kpi_buyers_daily k
    JOIN attributed_members_by_day amd ON amd.buyer_id = k.buyer_id AND amd.day = k.day
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.location_id IS NULL
      AND k.day >= (p_current_start AT TIME ZONE 'Asia/Kolkata')::date
      AND k.day < (p_current_end_exclusive AT TIME ZONE 'Asia/Kolkata')::date
    GROUP BY amd.cohort_id
  ),
  previous_metrics AS MATERIALIZED (
    SELECT amd.cohort_id, COALESCE(sum(k.orders_gmv), 0)::numeric AS gmv_previous
    FROM app.kpi_buyers_daily k
    JOIN attributed_members_by_day amd ON amd.buyer_id = k.buyer_id AND amd.day = k.day
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.location_id IS NULL
      AND k.day >= (p_previous_start AT TIME ZONE 'Asia/Kolkata')::date
      AND k.day < (p_previous_end_exclusive AT TIME ZONE 'Asia/Kolkata')::date
    GROUP BY amd.cohort_id
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

-- Helpful for the point-in-time join above: cohort_members(buyer_id, valid_from, valid_until)
-- is the exact shape attributed_members_by_day filters on per buyer.
CREATE INDEX IF NOT EXISTS "cohort_members_buyer_window_idx" ON "app"."cohort_members" ("buyer_id", "valid_from", "valid_until");
