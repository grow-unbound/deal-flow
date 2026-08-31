-- Perf: price-lists landing summary was recomputing customers_with_custom_prices
-- (active_buyers + covered_buyers CTEs), products_with_custom_prices, and
-- products_below_base_rate live on every request. Live EXPLAIN ANALYZE on
-- Wine Yard found active_buyers/covered_buyers alone cost 421ms of the
-- summary's 448ms total (94%) -- a full scan of app.buyers, unavoidable by
-- indexing alone because the correct index (idx_buyers_tenant_active) isn't
-- selective at this tenant's data distribution.
--
-- Turns out the metrics tick ALREADY precomputes exactly these values into
-- app.metrics_landing_kpi_snapshot under page_key = 'price_lists',
-- period_key = 'now' (see 20260820092643_buyer_app_kpi_v2.sql:335-339 --
-- custom_price_products, custom_price_customers, below_base_products,
-- expiring_7d) -- the landing RPC just never read them, and recomputed the
-- same numbers live instead. This migration makes it read the snapshot.
--
-- Left alone (still computed live, deliberately): active_lists, draft_lists,
-- expiring_soon, cohorts_covered/cohorts_total, todays_read.* -- all derived
-- from price_list_universe (the tenant's own price_lists rows, typically
-- single-digit to low-double-digit count), which was never the expensive
-- part and isn't worth touching.
--
-- Result: the summary path is now one indexed point lookup on
-- metrics_landing_kpi_snapshot_active_uk plus the existing cheap
-- price_list_universe-based CTEs -- O(1) with respect to buyer/product-item
-- volume, matching row_metrics' existing precomputed-table pattern.

CREATE OR REPLACE FUNCTION app.get_seller_price_list_landing_aggregates_v4(p_tenant_id uuid, p_page_ids uuid[], p_include_summary boolean DEFAULT true, p_now timestamp with time zone DEFAULT statement_timestamp())
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
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
  cohort_assignment_names AS MATERIALIZED (
    SELECT
      pla.price_list_id,
      count(DISTINCT pla.target_id) FILTER (WHERE pla.target_type = 'cohort' AND pla.target_id IS NOT NULL)::bigint AS cohorts_count,
      COALESCE(
        jsonb_agg(DISTINCT c.name) FILTER (WHERE pla.target_type = 'cohort' AND c.id IS NOT NULL),
        '[]'::jsonb
      ) AS cohort_names
    FROM app.price_list_assignments pla
    JOIN price_list_universe pl ON pl.id = pla.price_list_id
    LEFT JOIN app.cohorts c ON c.id = pla.target_id
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
    WHERE pla.deleted_at IS NULL
    GROUP BY pla.price_list_id
  ),
  row_metrics AS MATERIALIZED (
    SELECT
      pl.id,
      COALESCE(m.member_product_count, 0)::bigint AS product_count,
      CASE WHEN COALESCE(m.member_product_count, 0) = 0 THEN NULL ELSE round(m.avg_discount_pct, 1) END AS avg_discount_pct,
      CASE WHEN COALESCE(m.member_product_count, 0) = 0 THEN NULL ELSE round(m.avg_margin_pct, 1) END AS avg_margin_pct,
      COALESCE(ca.cohorts_count, 0)::bigint AS cohorts_count,
      COALESCE(ca.cohort_names, '[]'::jsonb) AS cohort_names
    FROM price_list_universe pl
    LEFT JOIN app.metrics_price_lists_now_summary m
      ON m.tenant_id = p_tenant_id AND m.price_list_id = pl.id AND m.deleted_at IS NULL
    LEFT JOIN cohort_assignment_names ca ON ca.price_list_id = pl.id
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
  assigned_cohorts AS MATERIALIZED (
    SELECT DISTINCT pla.target_id AS cohort_id
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
      AND pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
    WHERE p_include_summary
      AND pla.deleted_at IS NULL
      AND pla.target_type = 'cohort'
      AND pla.target_id IS NOT NULL
  ),
  uncovered_cohorts AS MATERIALIZED (
    SELECT c.id, c.name, count(DISTINCT cm.buyer_id)::bigint AS member_count
    FROM app.cohorts c
    LEFT JOIN app.cohort_members cm ON cm.cohort_id = c.id AND cm.valid_until IS NULL
    WHERE p_include_summary
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM assigned_cohorts ac WHERE ac.cohort_id = c.id)
    GROUP BY c.id, c.name
    ORDER BY member_count DESC, c.id
    LIMIT 3
  ),
  kpi_bounds AS MATERIALIZED (
    SELECT period_start FROM app.metrics_v4_period_bounds('now', p_now)
  ),
  kpi_snapshot AS MATERIALIZED (
    SELECT s.kpis
    FROM app.metrics_landing_kpi_snapshot s
    WHERE p_include_summary
      AND s.tenant_id = p_tenant_id
      AND s.page_key = 'price_lists'
      AND s.scope_kind = 'tenant'
      AND s.scope_id IS NULL
      AND s.period_key = 'now'
      AND s.period_start = (SELECT period_start FROM kpi_bounds)
      AND s.deleted_at IS NULL
    LIMIT 1
  ),
  kpi_values AS MATERIALIZED (
    SELECT
      COALESCE((SELECT (elem->>'value')::bigint FROM kpi_snapshot ks, jsonb_array_elements(ks.kpis) elem WHERE elem->>'id' = 'custom_price_products'), 0) AS custom_price_products,
      COALESCE((SELECT (elem->>'value')::bigint FROM kpi_snapshot ks, jsonb_array_elements(ks.kpis) elem WHERE elem->>'id' = 'custom_price_customers'), 0) AS custom_price_customers,
      COALESCE((SELECT (elem->>'value')::bigint FROM kpi_snapshot ks, jsonb_array_elements(ks.kpis) elem WHERE elem->>'id' = 'below_base_products'), 0) AS below_base_products
  ),
  summary AS MATERIALIZED (
    SELECT jsonb_build_object(
      'kpis', jsonb_build_object(
        'active_lists', count(*) FILTER (WHERE pl.status = 'active'),
        'draft_lists', count(*) FILTER (WHERE pl.status = 'draft'),
        'expiring_soon', count(*) FILTER (WHERE pl.status = 'active' AND pl.valid_to >= p_now AND pl.valid_to <= p_now + interval '7 days'),
        'cohorts_covered', (SELECT count(*) FROM active_coverage),
        'cohorts_total', (SELECT count(*) FROM app.cohorts c WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL),
        'products_with_overrides', (SELECT custom_price_products FROM kpi_values),
        'products_with_custom_prices', (SELECT custom_price_products FROM kpi_values),
        'customers_with_custom_prices', (SELECT custom_price_customers FROM kpi_values),
        'products_below_base_rate', (SELECT below_base_products FROM kpi_values)
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
            'cohorts_count', COALESCE(ca.cohorts_count, 0),
            'status', rows.status
          ) ORDER BY rows.valid_to, rows.id)
          FROM (SELECT * FROM price_list_universe WHERE status = 'active' AND valid_to >= p_now AND valid_to <= p_now + interval '7 days' ORDER BY valid_to, id LIMIT 3) rows
          LEFT JOIN cohort_assignment_names ca ON ca.price_list_id = rows.id
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

-- CREATE OR REPLACE with an unchanged signature preserves existing grants.
