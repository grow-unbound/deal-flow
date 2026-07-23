-- Retire app.kpi_buyers_daily (V1 table) entirely, per explicit direction: Cohorts
-- (and anything else) must read from V2 metrics_* tables, never re-derive from raw
-- live tables and never keep a V1 table alive just to patch one consumer.
--
-- Supersedes 20260723125211_restore_kpi_buyers_daily_refresh_for_cohorts.sql from
-- earlier this session, which restored a periodic refresh of kpi_buyers_daily as a
-- quick fix for Cohorts landing reading a frozen table. That was the wrong direction
-- once the actual instruction was to drop the table, not resurrect its refresh.
--
-- app.get_seller_cohort_landing_aggregates was the only real dependency (confirmed
-- via repo-wide grep — all other hits are historical migration files or unit tests
-- asserting against past migration SQL text, neither of which touches a live table).
-- Its point-in-time "attribute each historical order/estimate to whichever cohort the
-- buyer was in on that transaction day" logic depended on kpi_buyers_daily's
-- (buyer_id, day) grain, which no V2 table provides — V2 buyer-grain tables
-- (metrics_buyer_snapshot, metrics_buyer_location_snapshot) are single-row rolling
-- 90d snapshots, same shape every other V2 page already reads.
--
-- Approved simplification (asked the user directly, this was their choice): Cohorts'
-- GMV/active-member figures now come from CURRENT cohort membership joined against
-- each buyer's existing rolling-90d metrics_buyer_snapshot row — matching the
-- established V2 pattern everywhere else in the app — instead of historical
-- point-in-time re-attribution. Trade-off, stated plainly: a buyer who switched
-- cohorts mid-period has their recent 90d activity attributed to their CURRENT
-- cohort, not whichever cohort they were in at the moment they actually transacted.
-- Same simplification every other snapshot-based page in this app already makes.
--
-- Side effect: metrics_buyer_snapshot carries only a current 90d window, no
-- previous-period column, so gmv_previous/growth_pct are no longer computable at
-- buyer grain — both now read 0 for every cohort. The "top_risers" callout (sorts
-- by growth_pct desc) is consequently a no-op until/unless a V2 day-grain buyer
-- table is built — ties break to gmv_mtd desc, so it currently just duplicates
-- top_performers. Flagged here rather than silently degraded.

-- 1. Undo this session's now-superseded restore: unschedule the cron and drop the
--    function that only existed to keep kpi_buyers_daily alive.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'kpi-buyers-daily-freshness';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS app.refresh_all_kpi_buyers_daily_recent();

-- 2. Rewrite Cohorts landing off kpi_buyers_daily, onto metrics_buyer_snapshot +
--    current cohort membership + the same primary-demand-kind switch already used
--    for Brands (app.metrics_v2_primary_demand_kind).
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
  -- columns per the tenant's primary demand kind — same pattern as Brands.
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
      0::numeric AS gmv_previous,
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
      -- gmv_previous is always 0 (see migration header) -- growth_pct is
      -- consequently always 0; kept as a real computed field, not hardcoded, so it
      -- self-corrects if a previous-period buyer-grain source is added later.
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

-- 3. Drop the now-dead V1 refresh functions and the table itself.
DROP FUNCTION IF EXISTS app.refresh_kpi_buyers_daily(uuid, date);
DROP FUNCTION IF EXISTS app.rebuild_kpi_buyers_daily_for_tenant(uuid, integer);
DROP TABLE IF EXISTS app.kpi_buyers_daily;
