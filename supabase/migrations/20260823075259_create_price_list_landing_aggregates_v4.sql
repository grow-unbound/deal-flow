-- Perf: v4 replacement for app.get_seller_price_list_landing_aggregates.
--
-- The v2 function recomputed product_count/avg_discount_pct/avg_margin_pct
-- live via MATERIALIZED CTEs joining price_list_items x tenant_products on
-- every call -- including every page-scroll call from the price-lists
-- landing page (app/api/price-lists/route.ts calls this RPC on every
-- page/filter change with p_include_summary=false). That exact computation
-- is already precomputed and kept fresh by the existing v4 refresh pipeline
-- in app.metrics_price_lists_now_summary (written by
-- _metrics_v4_refresh_setup_now, verified fresh and matching live values
-- for a real tenant before writing this migration).
--
-- Scope of this rewrite: only the row_metrics block (the hot path, called
-- on every scroll/filter) is switched to read the precomputed table.
-- cohorts_count/cohort_names still join price_list_assignments/cohorts
-- live -- that join is scoped to a tenant's handful of price lists, not a
-- tenant-wide buyer/product scan, and was never the expensive part. The
-- summary block (kpis/counts/todays_read, computed once per page load via
-- p_include_summary=true, not on every scroll) is carried over verbatim
-- from the v2 function -- it's already correct, already guarded with the
-- same statement_timeout/lock_timeout, and low-frequency enough that
-- rebuilding it against precomputed data isn't where the win is.
--
-- v2 function (app.get_seller_price_list_landing_aggregates) is left in
-- place for now -- app/api/price-lists/route.ts's RPC call name needs to
-- be switched to this v4 function in application code before the v2
-- function can be dropped.

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
      round(m.avg_discount_pct, 1) AS avg_discount_pct,
      round(m.avg_margin_pct, 1) AS avg_margin_pct,
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
  custom_priced_products AS MATERIALIZED (
    SELECT DISTINCT pli.tenant_product_id
    FROM app.price_list_items pli
    JOIN app.price_lists pl ON pl.id = pli.price_list_id
      AND pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
    JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
      AND tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
    WHERE p_include_summary
      AND pli.deleted_at IS NULL
  ),
  products_below_base AS MATERIALIZED (
    SELECT DISTINCT pli.tenant_product_id
    FROM app.price_list_items pli
    JOIN app.price_lists pl ON pl.id = pli.price_list_id
      AND pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
    JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
      AND tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
    WHERE p_include_summary
      AND pli.deleted_at IS NULL
      AND pli.price < tp.base_selling_price
  ),
  active_buyers AS MATERIALIZED (
    SELECT b.id
    FROM app.buyers b
    WHERE p_include_summary
      AND b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND b.is_active = true
  ),
  covered_buyers AS MATERIALIZED (
    SELECT ab.id AS buyer_id
    FROM active_buyers ab
    JOIN app.price_list_assignments pla ON pla.target_type = 'buyer'
      AND pla.target_id = ab.id
      AND pla.deleted_at IS NULL
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
      AND pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL

    UNION

    SELECT ab.id AS buyer_id
    FROM active_buyers ab
    JOIN app.cohort_members cm ON cm.buyer_id = ab.id AND cm.valid_until IS NULL
    JOIN app.price_list_assignments pla ON pla.target_type = 'cohort'
      AND pla.target_id = cm.cohort_id
      AND pla.deleted_at IS NULL
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
      AND pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL

    UNION

    SELECT ab.id AS buyer_id
    FROM active_buyers ab
    WHERE EXISTS (
      SELECT 1
      FROM app.price_list_assignments pla
      JOIN app.price_lists pl ON pl.id = pla.price_list_id
        AND pl.tenant_id = p_tenant_id
        AND pl.deleted_at IS NULL
      WHERE pla.deleted_at IS NULL
        AND pla.target_type = 'all_buyers'
    )
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
  summary AS MATERIALIZED (
    SELECT jsonb_build_object(
      'kpis', jsonb_build_object(
        'active_lists', count(*) FILTER (WHERE pl.status = 'active'),
        'draft_lists', count(*) FILTER (WHERE pl.status = 'draft'),
        'expiring_soon', count(*) FILTER (WHERE pl.status = 'active' AND pl.valid_to >= p_now AND pl.valid_to <= p_now + interval '7 days'),
        'cohorts_covered', (SELECT count(*) FROM active_coverage),
        'cohorts_total', (SELECT count(*) FROM app.cohorts c WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL),
        'products_with_overrides', (SELECT count(*) FROM custom_priced_products),
        'products_with_custom_prices', (SELECT count(*) FROM custom_priced_products),
        'customers_with_custom_prices', (SELECT count(*) FROM covered_buyers),
        'products_below_base_rate', (SELECT count(*) FROM products_below_base)
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
