-- Extend app.metrics_v2_primary_demand_kind() to Brands and Cohorts landing (rule 6,
-- specs/kpi-callout-audit-2026-07-23.md §3 "Brands"/"Cohorts", §6 rule 6, §7 P1 item 6).
--
-- Both RPCs previously hardcoded app.orders/app.order_items as the only GMV/demand
-- source, regardless of app.metrics_v2_primary_demand_kind(tenant_id). For an
-- estimate-primary tenant (orders disabled, enquiries/estimates enabled) this made
-- Brands' portfolio_gmv_mtd and Cohorts' combined_gmv_mtd read ~0 even when the tenant
-- carries real invoiced sales and thousands of open estimates (live-verified on tenant
-- d601c35c-1a78-4506-a556-a82118d72893).
--
-- Fix follows the established branching pattern already used by
-- app.get_metrics_v2_buyer_app_dashboard / app.get_metrics_v2_seller_dashboard:
--   v_primary = 'orders' or 'none'  -> existing orders-based logic, unchanged
--   v_primary = 'estimates'         -> equivalent estimates-based computation
-- using app.estimate_status_is_open(status) OR status = 'accepted' (excluding
-- estimates already converted to an order), the same "live, open demand" estimate
-- predicate app.get_catalog_landing_metrics already uses for its own orders+estimates
-- demand figure.

-- =============================================================================
-- 1. app.get_seller_brand_landing_summary
--    period_brand: add an estimates-sourced branch (live query over
--    app.estimates/app.estimate_items, no kpi_brand_daily-equivalent snapshot exists
--    for estimates) that only participates when the tenant's primary demand kind is
--    'estimates'; orders branches (tenant-wide kpi_brand_daily sum, and the
--    location-scoped live app.orders/app.order_items join) are gated to
--    ('orders','none') and are otherwise byte-for-byte unchanged.
--    visible_brands: the location-scope "does this brand have activity at these
--    locations" check gets an estimates-side OR-branch alongside its existing
--    inventory/order-item checks, so an estimate-primary tenant's brands remain
--    visible when scoped by location.
--    buyer_counts: buyers_with_orders_mtd's underlying "active buyers this period"
--    count switches to app.estimates when the tenant is estimate-primary, so the KPI
--    stops reading 0 for a tenant whose demand flows through estimates.
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
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::numeric AS current_gmv,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_previous_start AND k.day < p_previous_end), 0)::numeric AS previous_gmv
  FROM app.kpi_brand_daily k
  CROSS JOIN demand_kind dk
  WHERE p_location_ids IS NULL AND dk.kind IN ('orders', 'none') AND k.tenant_id = p_tenant_id
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
  CROSS JOIN demand_kind dk
  WHERE p_location_ids IS NOT NULL AND dk.kind IN ('orders', 'none') AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
    AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
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
    ), 0)::numeric,
    COALESCE(sum(COALESCE(ei.line_total, ei.qty * ei.unit_price)) FILTER (
      WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= p_previous_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < p_previous_end
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
    AND app.metric_day_ist(e.estimate_date, e.created_at) >= LEAST(p_previous_start, p_current_start)
    AND app.metric_day_ist(e.estimate_date, e.created_at) < GREATEST(p_previous_end, p_current_end)
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

-- =============================================================================
-- 2. app.get_seller_cohort_landing_aggregates
--    app.kpi_buyers_daily already carries both orders_gmv/orders_count AND
--    estimates_gmv/estimates_count columns (populated regardless of tenant demand
--    kind), so no new live query is needed here -- current_metrics/previous_metrics
--    just need to pick the estimates_* columns instead of orders_* when the tenant's
--    primary demand kind is 'estimates'. 'orders'/'none' keep summing orders_gmv/
--    orders_count unchanged. attributed_members_by_day, member_metrics,
--    campaign_metrics, cohort_views, buyer_summary are untouched -- they don't
--    reference orders_gmv/orders_count at all.
-- =============================================================================
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
      COALESCE(sum(CASE WHEN dk.kind = 'estimates' THEN k.estimates_gmv ELSE k.orders_gmv END), 0)::numeric AS gmv_mtd,
      COALESCE(sum(CASE WHEN dk.kind = 'estimates' THEN k.estimates_count ELSE k.orders_count END), 0)::bigint AS orders_mtd,
      count(DISTINCT k.buyer_id) FILTER (
        WHERE (dk.kind = 'estimates' AND k.estimates_count > 0)
           OR (dk.kind <> 'estimates' AND k.orders_count > 0)
      )::bigint AS active_members
    FROM app.kpi_buyers_daily k
    JOIN attributed_members_by_day amd ON amd.buyer_id = k.buyer_id AND amd.day = k.day
    CROSS JOIN demand_kind dk
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.location_id IS NULL
      AND k.day >= (p_current_start AT TIME ZONE 'Asia/Kolkata')::date
      AND k.day < (p_current_end_exclusive AT TIME ZONE 'Asia/Kolkata')::date
    GROUP BY amd.cohort_id
  ),
  previous_metrics AS MATERIALIZED (
    SELECT amd.cohort_id,
      COALESCE(sum(CASE WHEN dk.kind = 'estimates' THEN k.estimates_gmv ELSE k.orders_gmv END), 0)::numeric AS gmv_previous
    FROM app.kpi_buyers_daily k
    JOIN attributed_members_by_day amd ON amd.buyer_id = k.buyer_id AND amd.day = k.day
    CROSS JOIN demand_kind dk
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
