-- Compact, read-only aggregate seams for paged seller cohort and price-list landings.
-- Page metrics are always bounded by p_page_ids; tenant summaries are skipped after page zero.

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
        'low_conversion', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY conversion_pct, id) FROM (SELECT * FROM enriched ORDER BY conversion_pct, id LIMIT 2) rows), '[]'::jsonb),
        'top_performers', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY gmv_mtd DESC, id) FROM (SELECT * FROM enriched ORDER BY gmv_mtd DESC, id LIMIT 2) rows), '[]'::jsonb),
        'top_risers', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY growth_pct DESC, id) FROM (SELECT * FROM enriched ORDER BY growth_pct DESC, id LIMIT 2) rows), '[]'::jsonb)
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
    LIMIT 3
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
          FROM (SELECT * FROM price_list_universe WHERE status = 'active' AND valid_to >= p_now AND valid_to <= p_now + interval '7 days' ORDER BY valid_to, id LIMIT 3) rows
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
            LIMIT 2
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

REVOKE ALL ON FUNCTION app.get_seller_cohort_landing_aggregates(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_cohort_landing_aggregates(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb, boolean) TO service_role;

REVOKE ALL ON FUNCTION app.get_seller_price_list_landing_aggregates(uuid, uuid[], boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_price_list_landing_aggregates(uuid, uuid[], boolean, timestamptz) TO service_role;
