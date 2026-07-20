-- =============================================================================
-- V1 SNAPSHOT RETIREMENT
--
-- Removes buyers_snapshot / buyer_current_snapshot tables, all write functions
-- that populate them, and the nightly cron that refreshed them.
--
-- Read functions that joined these tables are migrated to v2 equivalents:
--   - tenant-scope reads: metrics_buyer_snapshot
--   - location-scope reads: metrics_buyer_location_snapshot
--
-- V2 metrics are already live and power every seller-facing route.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unschedule the nightly cron
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname = 'buyer-metric-snapshot-freshness';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Update dispatch trigger functions — remove v1 per-buyer refresh calls.
--    V2 capture triggers (trg_metrics_v2_capture_*) already enqueue dirty-work.
-- -----------------------------------------------------------------------------

-- dispatch_from_estimates: keep sync_buyer_app_activity_from_estimate only
CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF NOT v_bypass THEN
    PERFORM app.sync_buyer_app_activity_from_estimate(COALESCE(NEW.id, OLD.id));
  END IF;

  RETURN NULL;
END;
$$;

-- dispatch_from_invoices: v1 refresh calls removed; no surviving side-effect
CREATE OR REPLACE FUNCTION app.dispatch_from_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  RETURN NULL;
END;
$$;

-- dispatch_from_orders: keep sync_buyer_app_activity_from_order only
CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF NOT v_bypass THEN
    PERFORM app.sync_buyer_app_activity_from_order(COALESCE(NEW.id, OLD.id));
  END IF;

  RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Migrate read RPCs from v1 to v2 snapshot tables.
-- -----------------------------------------------------------------------------

-- 3a. search_cohort_composer_buyers
--     buyers_snapshot (scope=tenant) -> metrics_buyer_snapshot
--     bs.outstanding_dues             -> bs.receivable_amount (return col name unchanged)
CREATE OR REPLACE FUNCTION app.search_cohort_composer_buyers(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_geographies text[] DEFAULT NULL,
  p_last_order_bucket text DEFAULT NULL,
  p_gmv_buckets text[] DEFAULT NULL,
  p_ninety_days_ago date DEFAULT (CURRENT_DATE - 90),
  p_month_start date DEFAULT date_trunc('month', CURRENT_DATE)::date,
  p_next_month_start date DEFAULT (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  buyer_id uuid,
  business_name text,
  contact_name text,
  external_ref text,
  geography jsonb,
  tier text,
  payment_terms_days integer,
  last_order_at timestamptz,
  outstanding_dues numeric,
  gmv_90d numeric,
  mtd_spend numeric,
  orders_mtd bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, public
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_query_text text;
  v_prefix_ts_query tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);

    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_query_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

    IF v_prefix_query_text IS NOT NULL THEN
      v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
    END IF;
  END IF;

  RETURN QUERY
  WITH eligible_buyers AS MATERIALIZED (
    SELECT
      b.id,
      b.business_name,
      b.contact_name,
      b.external_ref,
      b.geography,
      b.tier,
      b.payment_terms_days,
      CASE
        WHEN v_query IS NULL THEN 0::double precision
        WHEN b.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(b.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(b.search_vector, v_prefix_ts_query)::double precision
      END AS search_rank
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND (
        COALESCE(cardinality(p_geographies), 0) = 0
        OR b.geography->>'city' = ANY (p_geographies)
      )
      AND (
        v_query IS NULL
        OR b.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND b.search_vector @@ v_prefix_ts_query)
      )
  ),
  buyer_kpis AS MATERIALIZED (
    SELECT
      k.buyer_id,
      COALESCE(sum(k.orders_gmv), 0) AS gmv_90d,
      COALESCE(sum(k.orders_gmv) FILTER (
        WHERE k.day >= p_month_start AND k.day < p_next_month_start
      ), 0) AS mtd_spend,
      COALESCE(sum(k.orders_count) FILTER (
        WHERE k.day >= p_month_start AND k.day < p_next_month_start
      ), 0)::bigint AS orders_mtd
    FROM app.kpi_buyers_daily k
    JOIN eligible_buyers eb ON eb.id = k.buyer_id
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.day >= p_ninety_days_ago
    GROUP BY k.buyer_id
  ),
  filtered AS MATERIALIZED (
    SELECT
      eb.*,
      bs.last_order_at,
      COALESCE(bs.receivable_amount, 0) AS outstanding_dues,
      COALESCE(k.gmv_90d, 0) AS gmv_90d,
      COALESCE(k.mtd_spend, 0) AS mtd_spend,
      COALESCE(k.orders_mtd, 0) AS orders_mtd
    FROM eligible_buyers eb
    LEFT JOIN app.metrics_buyer_snapshot bs
      ON bs.tenant_id = p_tenant_id
     AND bs.buyer_id = eb.id
     AND bs.deleted_at IS NULL
    LEFT JOIN buyer_kpis k ON k.buyer_id = eb.id
    WHERE (
      p_last_order_bucket IS NULL
      OR p_last_order_bucket = 'anytime'
      OR (p_last_order_bucket = 'within_30_days' AND bs.last_order_at >= now() - interval '30 days')
      OR (p_last_order_bucket = 'within_90_days' AND bs.last_order_at >= now() - interval '90 days')
      OR (
        p_last_order_bucket = 'dormant_90_plus_days'
        AND (bs.last_order_at IS NULL OR bs.last_order_at < now() - interval '90 days')
      )
    )
      AND (
        COALESCE(cardinality(p_gmv_buckets), 0) = 0
        OR ('gmv_0' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) <= 0)
        OR ('gmv_1_50000' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 0 AND COALESCE(k.gmv_90d, 0) <= 50000)
        OR ('gmv_50001_200000' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 50000 AND COALESCE(k.gmv_90d, 0) <= 200000)
        OR ('gmv_200001_500000' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 200000 AND COALESCE(k.gmv_90d, 0) <= 500000)
        OR ('gmv_500001_plus' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 500000)
      )
  ),
  paged AS MATERIALIZED (
    SELECT f.*, count(*) OVER () AS result_count
    FROM filtered f
    ORDER BY f.search_rank DESC, f.business_name ASC, f.id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    p.id,
    p.business_name,
    p.contact_name,
    p.external_ref,
    p.geography,
    p.tier,
    p.payment_terms_days,
    p.last_order_at,
    p.outstanding_dues,
    p.gmv_90d,
    p.mtd_spend,
    p.orders_mtd,
    p.result_count
  FROM paged p
  ORDER BY p.search_rank DESC, p.business_name ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) TO service_role;

-- 3b. search_cohort_buyers_detail
--     buyers_snapshot (scope=tenant) -> metrics_buyer_snapshot
--     bs.outstanding_dues             -> bs.receivable_amount (credit_used col unchanged)
create or replace function app.search_cohort_buyers_detail(
  p_tenant_id uuid, p_cohort_id uuid, p_query text default null, p_activity text default null,
  p_sort text default 'spend_desc', p_limit integer default 50, p_offset integer default 0
)
returns table (buyer_id uuid,business_name text,contact_name text,external_ref text,geography_label text,tier text,
  mtd_spend numeric,orders_mtd bigint,aov numeric,credit_used numeric,last_order_at timestamptz,total_count bigint)
language sql stable security definer set search_path='' set statement_timeout='10s'
as $$
  with query_terms as materialized (
    select case when nullif(btrim(p_query),'') is null then null else websearch_to_tsquery('english',btrim(p_query)) end exact_query,
      case when prefix_text is null then null else to_tsquery('english',prefix_text) end prefix_query
    from (select string_agg(quote_literal(lexeme)||':*',' & ' order by lexeme) prefix_text
      from unnest(tsvector_to_array(to_tsvector('english',coalesce(nullif(btrim(p_query),''),'')))) x(lexeme)) p
  ), mtd as materialized (
    select k.buyer_id, sum(k.orders_gmv) spend, sum(k.orders_count) orders
    from app.kpi_buyers_daily k
    where k.tenant_id=p_tenant_id and k.scope='tenant'
      and k.day>=date_trunc('month',current_date)::date
    group by k.buyer_id
  ), filtered as (
    select b.id,b.business_name,b.contact_name,b.external_ref,coalesce(b.geography->>'city',b.geography->>'state','—') geography_label,b.tier,
      coalesce(m.spend,0) spend,coalesce(m.orders,0) orders,
      case when coalesce(m.orders,0)>0 then round(m.spend/m.orders,2) else 0 end aov,
      coalesce(bs.receivable_amount,0) credit_used,bs.last_order_at,
      ts_rank_cd(b.search_vector,coalesce(q.exact_query,q.prefix_query)) rank
    from app.cohort_members cm join app.cohorts c on c.id=cm.cohort_id and c.tenant_id=p_tenant_id and c.deleted_at is null
    join app.buyers b on b.id=cm.buyer_id and b.tenant_id=p_tenant_id and b.deleted_at is null cross join query_terms q
    left join mtd m on m.buyer_id=b.id
    left join app.metrics_buyer_snapshot bs on bs.tenant_id=p_tenant_id and bs.buyer_id=b.id and bs.deleted_at is null
    where cm.cohort_id=p_cohort_id and (q.exact_query is null or b.search_vector@@q.exact_query or b.search_vector@@q.prefix_query)
      and (nullif(p_activity,'') is null or (p_activity='ordered_mtd' and coalesce(m.orders,0)>0)
        or (p_activity='dormant' and (bs.last_order_at is null or bs.last_order_at<current_date-interval '30 days')))
  )
  select f.id,f.business_name,f.contact_name,f.external_ref,f.geography_label,f.tier,f.spend,f.orders,f.aov,f.credit_used,f.last_order_at,count(*) over ()::bigint
  from filtered f order by case when nullif(btrim(p_query),'') is not null then f.rank end desc,
    case when p_sort='orders_desc' then f.orders end desc,case when p_sort='aov_desc' then f.aov end desc,
    case when p_sort='name_asc' then f.business_name end,case when p_sort='last_order_desc' then f.last_order_at end desc nulls last,
    case when p_sort not in ('orders_desc','aov_desc','name_asc','last_order_desc') then f.spend end desc,f.business_name,f.id
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
$$;

-- 3c. global_search
--     buyers_snapshot EXISTS block removed entirely (redundant: orders/invoices/estimates cover the same scope)
CREATE OR REPLACE FUNCTION app.global_search(
  p_query text,
  p_tenant_id uuid,
  p_role text DEFAULT 'seller_admin',
  p_items_per_group integer DEFAULT 5,
  p_query_embedding public.vector(1536) DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  entity_type text,
  id uuid,
  label text,
  sublabel text,
  url_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_like text;
  v_prefix_query_text text;
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_is_assistant boolean := p_role = 'seller_assistant';
  v_location_ids uuid[] := COALESCE(p_location_ids, ARRAY[]::uuid[]);
  v_limit integer := LEAST(GREATEST(COALESCE(p_items_per_group, 5), 1), 10);
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  v_like := '%' || lower(v_query) || '%';
  v_ts_query := websearch_to_tsquery('english', v_query);

  SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
  INTO v_prefix_query_text
  FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

  IF v_prefix_query_text IS NOT NULL THEN
    v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
  END IF;

  RETURN QUERY
  WITH product_matches AS MATERIALIZED (
    SELECT
      'product'::text AS entity_type,
      sp.tenant_product_id AS id,
      sp.product_name AS label,
      concat_ws(' · ', sp.brand_name, sp.category_name, sp.sku) AS sublabel,
      '/products/' || sp.tenant_product_id::text AS url_path,
      sp.search_rank AS rank
    FROM app.search_products_scoped(
      p_tenant_id := p_tenant_id,
      p_query := v_query,
      p_limit := v_limit,
      p_offset := 0,
      p_query_embedding := p_query_embedding,
      p_sort := 'relevance',
      p_include_inventory := false
    ) sp
    ORDER BY sp.search_rank DESC, sp.product_name ASC, sp.tenant_product_id ASC
    LIMIT v_limit
  ),
  brand_matches AS MATERIALIZED (
    SELECT
      'brand'::text AS entity_type,
      tb.id,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS label,
      COALESCE(tb.description_override, tb.description, cb.description, '') AS sublabel,
      '/brands/' || tb.id::text AS url_path,
      CASE
        WHEN tb.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(tb.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(tb.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.tenant_brands tb
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.tenant_id = p_tenant_id
      AND tb.is_active = true
      AND tb.deleted_at IS NULL
      AND (
        tb.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND tb.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, tb.id ASC
    LIMIT v_limit
  ),
  category_matches AS MATERIALIZED (
    SELECT
      'category'::text AS entity_type,
      tc.id,
      tc.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(tc.description, ''), ''),
        NULLIF(COALESCE(mc.name, ''), ''),
        CASE WHEN tc.is_active THEN 'Active' ELSE 'Inactive' END
      ) AS sublabel,
      '/categories/' || tc.id::text AS url_path,
      CASE
        WHEN tc.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(tc.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(tc.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.tenant_categories tc
    LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND (
        tc.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND tc.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, tc.id ASC
    LIMIT v_limit
  ),
  customer_matches AS MATERIALIZED (
    SELECT
      'customer'::text AS entity_type,
      b.id,
      b.business_name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(b.contact_name, ''), ''),
        NULLIF(COALESCE(b.geography->>'city', ''), ''),
        NULLIF(COALESCE(b.phone, ''), '')
      ) AS sublabel,
      '/customers/' || b.id::text AS url_path,
      CASE
        WHEN b.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(b.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(b.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND (
        b.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND b.search_vector @@ v_prefix_ts_query)
      )
      AND (
        NOT v_is_assistant
        OR EXISTS (
          SELECT 1
          FROM app.orders scoped_order
          WHERE scoped_order.tenant_id = p_tenant_id
            AND scoped_order.buyer_id = b.id
            AND scoped_order.location_id = ANY (v_location_ids)
            AND scoped_order.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM app.invoices scoped_invoice
          WHERE scoped_invoice.tenant_id = p_tenant_id
            AND scoped_invoice.buyer_id = b.id
            AND scoped_invoice.location_id = ANY (v_location_ids)
            AND scoped_invoice.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM app.estimates scoped_estimate
          WHERE scoped_estimate.tenant_id = p_tenant_id
            AND scoped_estimate.buyer_id = b.id
            AND scoped_estimate.location_id = ANY (v_location_ids)
            AND scoped_estimate.deleted_at IS NULL
        )
      )
    ORDER BY rank DESC, 3 ASC, b.id ASC
    LIMIT v_limit
  ),
  cohort_matches AS MATERIALIZED (
    SELECT
      'cohort'::text AS entity_type,
      c.id,
      c.name AS label,
      COALESCE(c.description, '') AS sublabel,
      '/customer-groups/' || c.id::text AS url_path,
      CASE
        WHEN c.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(c.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(c.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (
        c.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND c.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, c.id ASC
    LIMIT v_limit
  ),
  campaign_matches AS MATERIALIZED (
    SELECT
      'campaign'::text AS entity_type,
      c.id,
      c.name AS label,
      COALESCE(c.status, '') AS sublabel,
      '/campaigns/' || c.id::text AS url_path,
      CASE
        WHEN c.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(c.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(c.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.campaigns c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (
        c.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND c.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, c.id ASC
    LIMIT v_limit
  ),
  price_list_matches AS MATERIALIZED (
    SELECT
      'price_list'::text AS entity_type,
      pl.id,
      pl.name AS label,
      COALESCE(pl.description, '') AS sublabel,
      '/price-lists/' || pl.id::text AS url_path,
      CASE
        WHEN pl.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(pl.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(pl.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.price_lists pl
    WHERE pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
      AND (
        pl.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND pl.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, pl.id ASC
    LIMIT v_limit
  ),
  order_matches AS MATERIALIZED (
    SELECT
      'order'::text AS entity_type,
      o.id,
      o.order_number AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/sales-orders/' || o.id::text AS url_path,
      CASE
        WHEN lower(o.order_number) = lower(v_query) THEN 3.0
        WHEN lower(o.order_number) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(o.order_number), lower(v_query))::double precision
      END AS rank
    FROM app.orders o
    LEFT JOIN app.buyers b ON b.id = o.buyer_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND (NOT v_is_assistant OR o.location_id = ANY (v_location_ids))
      AND (
        lower(o.order_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(o.order_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, o.id ASC
    LIMIT v_limit
  ),
  invoice_matches AS MATERIALIZED (
    SELECT
      'invoice'::text AS entity_type,
      i.id,
      i.invoice_number AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/invoices/' || i.id::text AS url_path,
      CASE
        WHEN lower(i.invoice_number) = lower(v_query) THEN 3.0
        WHEN lower(i.invoice_number) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(i.invoice_number), lower(v_query))::double precision
      END AS rank
    FROM app.invoices i
    LEFT JOIN app.buyers b ON b.id = i.buyer_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND (NOT v_is_assistant OR i.location_id = ANY (v_location_ids))
      AND (
        lower(i.invoice_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(i.invoice_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, i.id ASC
    LIMIT v_limit
  ),
  estimate_matches AS MATERIALIZED (
    SELECT
      'estimate'::text AS entity_type,
      e.id,
      COALESCE(e.estimate_number, '') AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/estimates/' || e.id::text AS url_path,
      CASE
        WHEN lower(COALESCE(e.estimate_number, '')) = lower(v_query) THEN 3.0
        WHEN lower(COALESCE(e.estimate_number, '')) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(COALESCE(e.estimate_number, '')), lower(v_query))::double precision
      END AS rank
    FROM app.estimates e
    LEFT JOIN app.buyers b ON b.id = e.buyer_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.estimate_number IS NOT NULL
      AND (NOT v_is_assistant OR e.location_id = ANY (v_location_ids))
      AND (
        lower(e.estimate_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(e.estimate_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, e.id ASC
    LIMIT v_limit
  ),
  location_matches AS MATERIALIZED (
    SELECT
      'location'::text AS entity_type,
      l.id,
      l.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(l.address->>'city', ''), ''),
        NULLIF(COALESCE(l.address->>'state', ''), '')
      ) AS sublabel,
      '/locations/' || l.id::text AS url_path,
      CASE
        WHEN l.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(l.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(l.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (NOT v_is_assistant OR l.id = ANY (v_location_ids))
      AND (
        l.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND l.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, l.id ASC
    LIMIT v_limit
  ),
  warehouse_matches AS MATERIALIZED (
    SELECT
      'warehouse'::text AS entity_type,
      w.id,
      w.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(w.address->>'city', ''), ''),
        NULLIF(COALESCE(w.address->>'state', ''), '')
      ) AS sublabel,
      '/warehouses/' || w.id::text AS url_path,
      CASE
        WHEN w.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(w.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(w.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (NOT v_is_assistant OR w.location_id = ANY (v_location_ids))
      AND (
        w.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND w.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, w.id ASC
    LIMIT v_limit
  ),
  all_matches AS (
    SELECT *, 1 AS group_order FROM product_matches
    UNION ALL SELECT *, 2 FROM brand_matches
    UNION ALL SELECT *, 3 FROM category_matches
    UNION ALL SELECT *, 4 FROM customer_matches
    UNION ALL SELECT *, 5 FROM cohort_matches
    UNION ALL SELECT *, 6 FROM campaign_matches
    UNION ALL SELECT *, 7 FROM price_list_matches
    UNION ALL SELECT *, 8 FROM order_matches
    UNION ALL SELECT *, 9 FROM invoice_matches
    UNION ALL SELECT *, 10 FROM estimate_matches
    UNION ALL SELECT *, 11 FROM location_matches
    UNION ALL SELECT *, 12 FROM warehouse_matches
  )
  SELECT
    matches.entity_type,
    matches.id,
    matches.label,
    matches.sublabel,
    matches.url_path
  FROM all_matches matches
  ORDER BY matches.group_order, matches.rank DESC, matches.label ASC, matches.id ASC;
END;
$$;

-- 3d. search_buyer_app_access
--     buyers_snapshot (scope=location) EXISTS -> metrics_buyer_location_snapshot EXISTS
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
          FROM app.metrics_buyer_location_snapshot mbs
          WHERE mbs.tenant_id = p_tenant_id
            AND mbs.buyer_id = b.id
            AND mbs.location_id = ANY (p_location_ids)
            AND mbs.deleted_at IS NULL
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
  buyers_to_aggregate AS MATERIALIZED (
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

-- 3e. get_seller_brand_landing_summary
--     buyers_snapshot (scope=location) EXISTS -> metrics_buyer_location_snapshot EXISTS
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
WITH period_brand AS MATERIALIZED (
  SELECT k.tenant_brand_id,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::numeric AS current_gmv,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_previous_start AND k.day < p_previous_end), 0)::numeric AS previous_gmv
  FROM app.kpi_brand_daily k
  WHERE p_location_ids IS NULL AND k.tenant_id = p_tenant_id
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
  WHERE p_location_ids IS NOT NULL AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
    AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
  GROUP BY tp.tenant_brand_id
),
visible_brands AS MATERIALIZED (
  SELECT tb.id, COALESCE(tb.display_name_override, cb.name, 'Unknown brand') AS name
  FROM app.tenant_brands tb
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id AND cb.deleted_at IS NULL
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
            OR EXISTS (
              SELECT 1 FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id
              WHERE oi.tenant_product_id = tp.id AND oi.deleted_at IS NULL
                AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
                AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
                AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
                AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
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
    count(DISTINCT o.buyer_id) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
        AND app.order_status_in_flow(o.status)
    )::bigint AS active_buyers
  FROM app.buyers b
  LEFT JOIN app.orders o ON o.tenant_id = p_tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
    AND (p_location_ids IS NULL OR o.location_id = ANY(p_location_ids))
    AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
    AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
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

-- -----------------------------------------------------------------------------
-- 4. Drop v1 write functions (callers updated above).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.refresh_all_buyer_metric_snapshots();
DROP FUNCTION IF EXISTS app.refresh_buyers_snapshot(uuid);
DROP FUNCTION IF EXISTS app.refresh_buyer_current_snapshot(uuid);
DROP FUNCTION IF EXISTS app.refresh_buyers_snapshot_for_buyer(uuid, uuid);
DROP FUNCTION IF EXISTS app.refresh_buyer_current_snapshot_for_buyer(uuid, uuid);

-- -----------------------------------------------------------------------------
-- 5. Drop v1 snapshot tables.
--    CASCADE drops indexes, policies, grants, and surviving FK references.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS app.buyers_snapshot CASCADE;
DROP TABLE IF EXISTS app.buyer_current_snapshot CASCADE;
