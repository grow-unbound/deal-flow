-- cohort_members SCD2 fix: both app.search_cohort_buyers_detail's is_member flag and
-- app.search_catalog_buyers' cohort-scoped campaign audience must only match a buyer's
-- currently-active cohort membership -- not historical (closed) rows.
--
-- IMPORTANT: reproduced from the functions' ACTUAL DEPLOYED bodies (via
-- pg_get_functiondef against the live project), not from
-- supabase/migrations/20260722151700_selectable_membership_detail_tables.sql. That local
-- migration file's signatures (extra p_status param, last_primary_demand_at/mtd_spend/
-- orders_mtd/aov/credit_used/last_order_at columns) do not match what is actually deployed
-- -- the file was edited after being applied, so `supabase db push` silently skips it as
-- "already applied" and the newer columns were never pushed. Attempting to deploy this
-- migration using the local file's signature fails with "cannot change return type of
-- existing function" (confirmed). This migration intentionally patches the CURRENTLY
-- DEPLOYED signature only, to stay in scope for the cohort_members SCD2 fix. Reconciling
-- the local/deployed drift for the newer columns is a separate, pre-existing issue.

CREATE OR REPLACE FUNCTION app.search_cohort_buyers_detail(p_tenant_id uuid, p_cohort_id uuid, p_query text DEFAULT NULL::text, p_member text DEFAULT 'yes'::text, p_last_sale text[] DEFAULT NULL::text[], p_sales_90d text[] DEFAULT NULL::text[], p_buyer_app text[] DEFAULT NULL::text[], p_sort text DEFAULT 'spend_desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(buyer_id uuid, business_name text, contact_name text, external_ref text, geography_label text, tier text, spend_90d numeric, invoice_count_90d bigint, demand_value_90d numeric, demand_count_90d bigint, outstanding_due numeric, last_invoice_at timestamp with time zone, is_member boolean, buyer_app_status text, primary_demand_kind text, mtd_spend numeric, orders_mtd bigint, aov numeric, credit_used numeric, last_order_at timestamp with time zone, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
  WITH primary_kind AS MATERIALIZED (
    SELECT app.metrics_v2_primary_demand_kind(p_tenant_id) AS kind
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), scoped AS MATERIALIZED (
    SELECT
      b.id,
      b.business_name,
      b.contact_name,
      b.external_ref,
      COALESCE(b.geography ->> 'city', b.geography ->> 'state', '—') AS geography_label,
      b.tier,
      COALESCE(mbs.invoice_value_90d, 0)::numeric AS spend_90d,
      COALESCE(mbs.invoice_count_90d, 0)::bigint AS invoice_count_90d,
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_value_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_value_90d, 0)
        ELSE 0
      END::numeric AS demand_value_90d,
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_count_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_count_90d, 0)
        ELSE 0
      END::bigint AS demand_count_90d,
      COALESCE(mbs.receivable_amount, 0)::numeric AS outstanding_due,
      mbs.last_invoice_at,
      (cm.buyer_id IS NOT NULL) AS is_member,
      app.derive_buyer_app_status(COALESCE(b.is_active, true), COALESCE(mbs.buyer_app_enabled, b.buyer_app_enabled, false)) AS buyer_app_status,
      pk.kind AS primary_demand_kind,
      app.derive_last_order_bucket_v2(mbs.last_invoice_at) AS last_sale_bucket,
      app.derive_sales_90d_level(COALESCE(mbs.invoice_value_90d, 0)) AS sales_90d_level,
      ts_rank_cd(b.search_vector, COALESCE(q.exact_query, q.prefix_query)) AS rank
    FROM app.buyers b
    CROSS JOIN primary_kind pk
    CROSS JOIN query_terms q
    LEFT JOIN app.cohort_members cm ON cm.cohort_id = p_cohort_id AND cm.buyer_id = b.id AND cm.valid_until IS NULL
    LEFT JOIN app.cohorts c ON c.id = p_cohort_id AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_snapshot mbs ON mbs.tenant_id = p_tenant_id AND mbs.buyer_id = b.id AND mbs.deleted_at IS NULL
    WHERE c.id IS NOT NULL
      AND b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND (q.exact_query IS NULL OR b.search_vector @@ q.exact_query OR b.search_vector @@ q.prefix_query)
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_last_sale), 0) = 0 OR last_sale_bucket = ANY(p_last_sale))
      AND (COALESCE(cardinality(p_sales_90d), 0) = 0 OR sales_90d_level = ANY(p_sales_90d))
      AND (COALESCE(cardinality(p_buyer_app), 0) = 0 OR buyer_app_status = ANY(p_buyer_app))
  )
  SELECT
    f.id,
    f.business_name,
    f.contact_name,
    f.external_ref,
    f.geography_label,
    f.tier,
    f.spend_90d,
    f.invoice_count_90d,
    f.demand_value_90d,
    f.demand_count_90d,
    f.outstanding_due,
    f.last_invoice_at,
    f.is_member,
    f.buyer_app_status,
    f.primary_demand_kind,
    f.spend_90d,
    f.demand_count_90d,
    CASE WHEN f.demand_count_90d > 0 THEN ROUND(f.demand_value_90d / f.demand_count_90d, 2) ELSE 0 END,
    f.outstanding_due,
    f.last_invoice_at,
    count(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'invoices_desc' THEN f.invoice_count_90d END DESC,
    CASE WHEN p_sort = 'demand_desc' THEN f.demand_value_90d END DESC,
    CASE WHEN p_sort = 'name_asc' THEN f.business_name END ASC,
    CASE WHEN p_sort = 'last_invoice_desc' THEN f.last_invoice_at END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('invoices_desc', 'demand_desc', 'name_asc', 'last_invoice_desc') THEN f.spend_90d END DESC,
    f.business_name,
    f.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

CREATE OR REPLACE FUNCTION app.search_catalog_buyers(p_tenant_id uuid, p_catalog_id uuid, p_query text DEFAULT NULL::text, p_member text DEFAULT 'yes'::text, p_status text[] DEFAULT NULL::text[], p_last_sale text[] DEFAULT NULL::text[], p_sales_90d text[] DEFAULT NULL::text[], p_buyer_app text[] DEFAULT NULL::text[], p_sort text DEFAULT 'gmv_desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(buyer_id uuid, buyer_name text, city text, geography_label text, cohort_label text, opened_status text, demand_value numeric, demand_count bigint, last_opened_at timestamp with time zone, last_conversion_at timestamp with time zone, is_member boolean, buyer_app_status text, primary_demand_kind text, total_count bigint, opens_count bigint, converted_count bigint, attributed_gmv numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
  WITH primary_kind AS MATERIALIZED (
    SELECT app.metrics_v2_primary_demand_kind(p_tenant_id) AS kind
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
        max(COALESCE(o.order_date, o.placed_at, o.created_at)) AS converted_at
      FROM app.orders o
      JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = oi.tenant_product_id AND ci.deleted_at IS NULL
      WHERE o.tenant_id = p_tenant_id
        AND o.campaign_id = p_catalog_id
        AND o.deleted_at IS NULL
        AND o.status <> 'cancelled'
      GROUP BY o.id, o.buyer_id
      UNION ALL
      SELECT e.id, e.buyer_id,
        sum(COALESCE(ei.line_total, COALESCE(ei.qty, 0) * COALESCE(ei.unit_price, 0)))::numeric AS amount,
        max(COALESCE(e.estimate_date, e.created_at)) AS converted_at
      FROM app.estimates e
      JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = ei.tenant_product_id AND ci.deleted_at IS NULL
      WHERE e.tenant_id = p_tenant_id
        AND e.campaign_id = p_catalog_id
        AND e.deleted_at IS NULL
        AND e.status NOT IN ('pending', 'void')
        AND e.converted_to_order_id IS NULL
      GROUP BY e.id, e.buyer_id
    ) x
    GROUP BY x.buyer_id
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
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_value_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_value_90d, 0)
        ELSE 0
      END::numeric AS demand_value,
      CASE pk.kind
        WHEN 'orders' THEN COALESCE(mbs.order_count_90d, 0)
        WHEN 'estimates' THEN COALESCE(mbs.estimate_count_90d, 0)
        ELSE 0
      END::bigint AS demand_count,
      v.last_opened_at,
      cv.last_conversion_at,
      (m.id IS NOT NULL) AS is_member,
      app.derive_buyer_app_status(COALESCE(b.is_active, true), COALESCE(mbs.buyer_app_enabled, b.buyer_app_enabled, false)) AS buyer_app_status,
      pk.kind AS primary_demand_kind,
      app.derive_last_order_bucket_v2(mbs.last_invoice_at) AS last_sale_bucket,
      app.derive_sales_90d_level(COALESCE(mbs.invoice_value_90d, 0)) AS sales_90d_level,
      ts_rank_cd(b.search_vector, COALESCE(q.exact_query, q.prefix_query)) AS rank
    FROM catalog c
    CROSS JOIN primary_kind pk
    CROSS JOIN query_terms q
    JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    LEFT JOIN member_ids m ON m.id = b.id
    LEFT JOIN app.cohorts ch ON ch.id::text = c.scope_value ->> 'cohort_id' AND ch.deleted_at IS NULL
    LEFT JOIN views v ON v.buyer_id = b.id
    LEFT JOIN conversions cv ON cv.buyer_id = b.id
    LEFT JOIN app.metrics_buyer_snapshot mbs ON mbs.tenant_id = p_tenant_id AND mbs.buyer_id = b.id AND mbs.deleted_at IS NULL
    WHERE (q.exact_query IS NULL OR b.search_vector @@ q.exact_query OR b.search_vector @@ q.prefix_query)
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_status), 0) = 0 OR opened_status = ANY(p_status))
      AND (COALESCE(cardinality(p_last_sale), 0) = 0 OR last_sale_bucket = ANY(p_last_sale))
      AND (COALESCE(cardinality(p_sales_90d), 0) = 0 OR sales_90d_level = ANY(p_sales_90d))
      AND (COALESCE(cardinality(p_buyer_app), 0) = 0 OR buyer_app_status = ANY(p_buyer_app))
  ), totals AS MATERIALIZED (
    SELECT
      count(*) FILTER (WHERE opened_status <> 'NOT YET OPENED')::bigint AS opens_count,
      count(*) FILTER (WHERE opened_status = 'CONVERTED')::bigint AS converted_count,
      coalesce(sum(demand_value), 0)::numeric AS attributed_gmv
    FROM filtered
  )
  SELECT
    f.buyer_id,
    f.buyer_name,
    f.city,
    f.geography_label,
    f.cohort_label,
    f.opened_status,
    f.demand_value,
    f.demand_count,
    f.last_opened_at,
    f.last_conversion_at,
    f.is_member,
    f.buyer_app_status,
    f.primary_demand_kind,
    count(*) OVER ()::bigint,
    t.opens_count,
    t.converted_count,
    t.attributed_gmv
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
$function$;
