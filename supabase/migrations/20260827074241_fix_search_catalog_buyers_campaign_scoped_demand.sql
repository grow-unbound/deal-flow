-- `search_catalog_buyers` sourced demand_value/demand_count from
-- app.metrics_buyer_period_summary -- a global per-tenant quarterly metric -- instead of
-- from orders/estimates actually attributed to this campaign (via campaign_items). That
-- made the campaign Buyers tab's "Estimates"/"Orders" column show a buyer's tenant-wide
-- demand, not their demand within this campaign. last_primary_demand_at was also always
-- NULL, so "Last Order"/"Last Estimate" never rendered a date. Add a campaign-scoped,
-- kind-split aggregate (mirroring the existing campaign-scoped `conversions` CTE) and use
-- it for demand_value/demand_count/last_primary_demand_at instead.
CREATE OR REPLACE FUNCTION app.search_catalog_buyers(
  p_tenant_id uuid,
  p_catalog_id uuid,
  p_query text DEFAULT NULL,
  p_member text DEFAULT 'yes',
  p_status text[] DEFAULT NULL,
  p_invoice_this_quarter text[] DEFAULT NULL,
  p_demand_this_quarter text[] DEFAULT NULL,
  p_buyer_app text[] DEFAULT NULL,
  p_sort text DEFAULT 'gmv_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  buyer_id uuid,
  buyer_name text,
  city text,
  geography_label text,
  cohort_label text,
  opened_status text,
  demand_value numeric,
  demand_count bigint,
  last_opened_at timestamptz,
  last_conversion_at timestamptz,
  last_primary_demand_at timestamptz,
  is_member boolean,
  buyer_app_status text,
  primary_demand_kind text,
  total_count bigint,
  opens_count bigint,
  converted_count bigint,
  attributed_gmv numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '10s'
AS $$
  WITH bounds AS MATERIALIZED (
    SELECT * FROM app.metrics_v4_period_bounds('this_quarter', now())
  ), primary_kind AS MATERIALIZED (
    SELECT app.metrics_v4_primary_demand_kind(p_tenant_id) AS kind
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), catalog AS MATERIALIZED (
    SELECT c.id, c.scope_type, c.scope_value
    FROM app.campaigns c
    WHERE c.id = p_catalog_id
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ), member_ids AS MATERIALIZED (
    SELECT b.id
    FROM catalog c
    JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    WHERE (c.scope_type <> 'all' OR b.is_active)
      AND (c.scope_type = 'all'
       OR (c.scope_type = 'buyer' AND (
         b.id::text = c.scope_value ->> 'buyer_id'
         OR b.id::text IN (SELECT jsonb_array_elements_text(COALESCE(c.scope_value -> 'buyer_ids', '[]'::jsonb)))
       ))
       OR (c.scope_type = 'geography' AND (
         COALESCE(b.geography ->> 'city', '') = COALESCE(c.scope_value ->> 'city', c.scope_value ->> 'value', '')
         OR COALESCE(b.geography ->> 'state', '') = COALESCE(c.scope_value ->> 'state', c.scope_value ->> 'value', '')
       )))
    UNION
    SELECT cm.buyer_id
    FROM catalog c
    JOIN app.cohort_members cm ON cm.cohort_id::text = c.scope_value ->> 'cohort_id' AND cm.valid_until IS NULL
    WHERE c.scope_type = 'cohort'
    UNION
    SELECT cbm.buyer_id
    FROM catalog c
    JOIN app.campaign_buyer_members cbm ON cbm.campaign_id = c.id AND cbm.valid_until IS NULL
  ), views AS MATERIALIZED (
    SELECT cv.buyer_id, max(cv.viewed_at) AS last_opened_at
    FROM app.campaign_views cv
    WHERE cv.tenant_id = p_tenant_id
      AND cv.campaign_id = p_catalog_id
      AND cv.deleted_at IS NULL
    GROUP BY cv.buyer_id
  ), conversions AS MATERIALIZED (
    SELECT x.buyer_id, count(*)::bigint AS conversions, sum(x.amount)::numeric AS spend, max(x.converted_at) AS last_conversion_at
    FROM (
      SELECT o.id, o.buyer_id,
        sum(COALESCE(oi.line_total, COALESCE(oi.qty, 0) * COALESCE(oi.unit_price, 0)))::numeric AS amount,
        max(COALESCE(o.order_date::timestamptz, o.placed_at, o.created_at)) AS converted_at
      FROM app.orders o
      JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = oi.tenant_product_id AND ci.deleted_at IS NULL
      WHERE o.tenant_id = p_tenant_id
        AND o.campaign_id = p_catalog_id
        AND o.deleted_at IS NULL
        AND app.order_status_in_flow(o.status)
      GROUP BY o.id, o.buyer_id
      UNION ALL
      SELECT e.id, e.buyer_id,
        sum(COALESCE(ei.line_total, COALESCE(ei.qty, 0) * COALESCE(ei.unit_price, 0)))::numeric AS amount,
        max(COALESCE(e.estimate_date::timestamptz, e.created_at)) AS converted_at
      FROM app.estimates e
      JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = ei.tenant_product_id AND ci.deleted_at IS NULL
      WHERE e.tenant_id = p_tenant_id
        AND e.campaign_id = p_catalog_id
        AND e.deleted_at IS NULL
        AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
        AND e.converted_to_order_id IS NULL
      GROUP BY e.id, e.buyer_id
    ) x
    GROUP BY x.buyer_id
  ), campaign_orders AS MATERIALIZED (
    SELECT o.buyer_id,
      count(DISTINCT o.id)::bigint AS order_count,
      sum(COALESCE(oi.line_total, COALESCE(oi.qty, 0) * COALESCE(oi.unit_price, 0)))::numeric AS order_value,
      max(COALESCE(o.order_date::timestamptz, o.placed_at, o.created_at)) AS last_order_at
    FROM app.orders o
    JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
    JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = oi.tenant_product_id AND ci.deleted_at IS NULL
    WHERE o.tenant_id = p_tenant_id
      AND o.campaign_id = p_catalog_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
    GROUP BY o.buyer_id
  ), campaign_estimates AS MATERIALIZED (
    SELECT e.buyer_id,
      count(DISTINCT e.id)::bigint AS estimate_count,
      sum(COALESCE(ei.line_total, COALESCE(ei.qty, 0) * COALESCE(ei.unit_price, 0)))::numeric AS estimate_value,
      max(COALESCE(e.estimate_date::timestamptz, e.created_at)) AS last_estimate_at
    FROM app.estimates e
    JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
    JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = ei.tenant_product_id AND ci.deleted_at IS NULL
    WHERE e.tenant_id = p_tenant_id
      AND e.campaign_id = p_catalog_id
      AND e.deleted_at IS NULL
      AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
      AND e.converted_to_order_id IS NULL
    GROUP BY e.buyer_id
  ), scoped AS MATERIALIZED (
    SELECT
      b.id AS buyer_id,
      b.business_name AS buyer_name,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '') AS city,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '—') AS geography_label,
      COALESCE(ch.name, CASE WHEN c.scope_type = 'all' THEN 'All buyers' ELSE 'Targeted buyers' END) AS cohort_label,
      CASE WHEN COALESCE(cv.conversions, 0) > 0 THEN 'CONVERTED'
           WHEN v.last_opened_at IS NOT NULL THEN 'OPENED'
           ELSE 'NOT YET OPENED' END AS opened_status,
      CASE pk.kind WHEN 'orders' THEN COALESCE(co.order_value, 0) WHEN 'estimates' THEN COALESCE(ce.estimate_value, 0) ELSE 0 END::numeric AS demand_value,
      CASE pk.kind WHEN 'orders' THEN COALESCE(co.order_count, 0) WHEN 'estimates' THEN COALESCE(ce.estimate_count, 0) ELSE 0 END::bigint AS demand_count,
      COALESCE(q.invoice_count, 0)::bigint AS invoice_count_qtd,
      v.last_opened_at,
      cv.last_conversion_at,
      CASE pk.kind WHEN 'orders' THEN co.last_order_at WHEN 'estimates' THEN ce.last_estimate_at ELSE NULL END AS last_primary_demand_at,
      (m.id IS NOT NULL) AS is_member,
      app.derive_buyer_app_status(COALESCE(b.is_active, true), COALESCE(b.buyer_app_enabled, false)) AS buyer_app_status,
      pk.kind AS primary_demand_kind,
      ts_rank_cd(b.search_vector, COALESCE(t.exact_query, t.prefix_query)) AS rank
    FROM catalog c
    CROSS JOIN primary_kind pk
    CROSS JOIN query_terms t
    CROSS JOIN bounds bd
    JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    LEFT JOIN member_ids m ON m.id = b.id
    LEFT JOIN app.cohorts ch ON ch.id::text = c.scope_value ->> 'cohort_id' AND ch.deleted_at IS NULL
    LEFT JOIN views v ON v.buyer_id = b.id
    LEFT JOIN conversions cv ON cv.buyer_id = b.id
    LEFT JOIN campaign_orders co ON co.buyer_id = b.id
    LEFT JOIN campaign_estimates ce ON ce.buyer_id = b.id
    LEFT JOIN app.metrics_buyer_period_summary q
      ON q.tenant_id = p_tenant_id AND q.buyer_id = b.id AND q.grain = 'quarter' AND q.period_start = bd.period_start AND q.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_now_summary nowm
      ON nowm.tenant_id = p_tenant_id AND nowm.buyer_id = b.id AND nowm.deleted_at IS NULL
    WHERE (t.exact_query IS NULL OR b.search_vector @@ t.exact_query OR b.search_vector @@ t.prefix_query)
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_status), 0) = 0 OR opened_status = ANY(p_status))
      AND (COALESCE(cardinality(p_invoice_this_quarter), 0) = 0
        OR ('purchased' = ANY(p_invoice_this_quarter) AND invoice_count_qtd > 0)
        OR ('not_purchased' = ANY(p_invoice_this_quarter) AND invoice_count_qtd = 0))
      AND (COALESCE(cardinality(p_demand_this_quarter), 0) = 0
        OR ('has_demand' = ANY(p_demand_this_quarter) AND demand_count > 0)
        OR ('no_demand' = ANY(p_demand_this_quarter) AND demand_count = 0))
      AND (COALESCE(cardinality(p_buyer_app), 0) = 0 OR buyer_app_status = ANY(p_buyer_app))
  ), totals AS MATERIALIZED (
    SELECT count(*) FILTER (WHERE opened_status <> 'NOT YET OPENED')::bigint AS opens_count,
           count(*) FILTER (WHERE opened_status = 'CONVERTED')::bigint AS converted_count,
           COALESCE(sum(demand_value), 0)::numeric AS attributed_gmv
    FROM filtered
  )
  SELECT
    f.buyer_id, f.buyer_name, f.city, f.geography_label, f.cohort_label, f.opened_status,
    f.demand_value, f.demand_count, f.last_opened_at, f.last_conversion_at, f.last_primary_demand_at,
    f.is_member, f.buyer_app_status, f.primary_demand_kind,
    count(*) OVER ()::bigint, t.opens_count, t.converted_count, t.attributed_gmv
  FROM filtered f
  CROSS JOIN totals t
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'conversions_desc' THEN f.demand_count END DESC,
    CASE WHEN p_sort = 'recently_opened' THEN f.last_opened_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN f.buyer_name END ASC,
    CASE WHEN p_sort NOT IN ('conversions_desc', 'recently_opened', 'name_asc') THEN f.demand_value END DESC,
    f.buyer_name,
    f.buyer_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
