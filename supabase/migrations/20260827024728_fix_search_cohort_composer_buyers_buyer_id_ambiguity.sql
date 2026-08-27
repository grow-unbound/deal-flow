-- Fix: app.search_cohort_composer_buyers threw "column reference "buyer_id" is
-- ambiguous" on every call, silently emptying the buyer picker in the UI (the
-- RPC error surfaces as a 500, which the SearchOverlayPicker-based pickers render
-- as a plain "no buyers match" empty state rather than an error).
--
-- Root cause: RETURNS TABLE(..., buyer_id uuid, ...) implicitly declares buyer_id
-- as a PL/pgSQL variable in scope for the whole function body. The new
-- location_buyer_ids CTE's `buyer_id` output column then collides with that
-- variable wherever it's referenced unqualified (`SELECT buyer_id FROM
-- location_buyer_ids`), which Postgres cannot disambiguate. Renamed the CTE's
-- column to `matched_buyer_id` to remove the collision -- no behavior change
-- otherwise.
--
-- Also drops the stale 10-param overload left behind by an earlier migration
-- (20260824010000 used CREATE OR REPLACE while *adding* a parameter, which
-- creates a new overload instead of replacing -- the old 10-param version was
-- never actually dropped). Harmless (named-arg calls only ever matched the
-- newer overload) but confusing schema state; cleaned up here.

DROP FUNCTION IF EXISTS app.search_cohort_composer_buyers(
  uuid, text, text[], text, text[], date, date, date, integer, integer
);

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
  p_offset integer DEFAULT 0,
  p_ids uuid[] DEFAULT NULL,
  p_quarter_start date DEFAULT date_trunc('quarter', CURRENT_DATE)::date,
  p_prev_quarter_start date DEFAULT (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date,
  p_quick_filters text[] DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_buyer_app_filter text DEFAULT NULL,
  p_outstanding_filter text DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
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
  total_count bigint,
  buyer_app_enabled boolean,
  overdue_amount numeric,
  invoice_count bigint
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
  v_quarter_start date := COALESCE(p_quarter_start, date_trunc('quarter', CURRENT_DATE)::date);
  v_prev_quarter_start date := COALESCE(p_prev_quarter_start, (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date);
  v_ids uuid[] := CASE WHEN COALESCE(cardinality(p_ids), 0) = 0 THEN NULL ELSE p_ids[1:250] END;
  v_want_top20 boolean := 'top20' = ANY (COALESCE(p_quick_filters, ARRAY[]::text[]));
  v_want_inactive boolean := COALESCE(p_status = 'inactive', false);
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  IF v_ids IS NULL AND v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);

    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_query_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

    IF v_prefix_query_text IS NOT NULL THEN
      v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
    END IF;
  END IF;

  RETURN QUERY
  WITH location_buyer_ids AS MATERIALIZED (
    SELECT DISTINCT i.buyer_id AS matched_buyer_id
    FROM app.invoices i
    WHERE p_location_id IS NOT NULL
      AND i.tenant_id = p_tenant_id
      AND i.location_id = p_location_id
      AND i.invoice_date >= v_quarter_start
      AND i.deleted_at IS NULL
  ),
  eligible_buyers AS MATERIALIZED (
    SELECT
      b.id,
      b.business_name,
      b.contact_name,
      b.external_ref,
      b.geography,
      b.tier,
      b.payment_terms_days,
      b.buyer_app_enabled,
      CASE
        WHEN v_ids IS NOT NULL THEN 0::double precision
        WHEN v_query IS NULL THEN 0::double precision
        WHEN b.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(b.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(b.search_vector, v_prefix_ts_query)::double precision
      END AS search_rank
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND (b.is_active = NOT v_want_inactive)
      AND (
        v_ids IS NOT NULL AND b.id = ANY (v_ids)
        OR (
          v_ids IS NULL
          AND (
            COALESCE(cardinality(p_geographies), 0) = 0
            OR b.geography->>'city' = ANY (p_geographies)
          )
          AND (
            v_query IS NULL
            OR b.search_vector @@ v_ts_query
            OR (v_prefix_ts_query IS NOT NULL AND b.search_vector @@ v_prefix_ts_query)
          )
          AND (p_location_id IS NULL OR b.id IN (SELECT matched_buyer_id FROM location_buyer_ids))
        )
      )
  ),
  filtered AS MATERIALIZED (
    SELECT
      eb.*,
      now_s.last_invoice_date::timestamptz AS last_order_at,
      COALESCE(now_s.receivable_amount, 0) AS outstanding_dues,
      COALESCE(now_s.overdue_amount, 0) AS overdue_amount,
      COALESCE(period_s.invoice_value, 0) AS gmv_90d,
      COALESCE(period_s.invoice_count, 0) AS invoice_count,
      0::numeric AS mtd_spend,
      0::bigint AS orders_mtd
    FROM eligible_buyers eb
    LEFT JOIN app.metrics_buyer_now_summary now_s
      ON now_s.tenant_id = p_tenant_id
     AND now_s.buyer_id = eb.id
     AND now_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_s
      ON period_s.tenant_id = p_tenant_id
     AND period_s.buyer_id = eb.id
     AND period_s.grain = 'quarter'
     AND period_s.period_start = v_quarter_start
     AND period_s.deleted_at IS NULL
    LEFT JOIN app.metrics_buyer_period_summary period_prev_s
      ON period_prev_s.tenant_id = p_tenant_id
     AND period_prev_s.buyer_id = eb.id
     AND period_prev_s.grain = 'quarter'
     AND period_prev_s.period_start = v_prev_quarter_start
     AND period_prev_s.deleted_at IS NULL
    WHERE v_ids IS NOT NULL
      OR (
        (
          p_last_order_bucket IS NULL
          OR p_last_order_bucket = 'anytime'
          OR (p_last_order_bucket = 'within_30_days' AND now_s.last_invoice_date >= CURRENT_DATE - 30)
          OR (p_last_order_bucket = 'within_90_days' AND now_s.last_invoice_date >= CURRENT_DATE - 90)
          OR (
            p_last_order_bucket = 'dormant_90_plus_days'
            AND (now_s.last_invoice_date IS NULL OR now_s.last_invoice_date < CURRENT_DATE - 90)
          )
        )
        AND (
          COALESCE(cardinality(p_gmv_buckets), 0) = 0
          OR ('gmv_0' = ANY (p_gmv_buckets) AND COALESCE(period_s.invoice_value, 0) <= 0)
          OR ('gmv_1_50000' = ANY (p_gmv_buckets) AND COALESCE(period_s.invoice_value, 0) > 0 AND COALESCE(period_s.invoice_value, 0) <= 50000)
          OR ('gmv_50001_200000' = ANY (p_gmv_buckets) AND COALESCE(period_s.invoice_value, 0) > 50000 AND COALESCE(period_s.invoice_value, 0) <= 200000)
          OR ('gmv_200001_500000' = ANY (p_gmv_buckets) AND COALESCE(period_s.invoice_value, 0) > 200000 AND COALESCE(period_s.invoice_value, 0) <= 500000)
          OR ('gmv_500001_plus' = ANY (p_gmv_buckets) AND COALESCE(period_s.invoice_value, 0) > 500000)
        )
        AND (
          COALESCE(cardinality(p_quick_filters), 0) = 0
          OR (
            ('has_dues' = ANY (p_quick_filters) AND COALESCE(now_s.receivable_amount, 0) > 0)
            OR ('overdue' = ANY (p_quick_filters) AND COALESCE(now_s.overdue_amount, 0) > 0)
            OR ('app_enabled' = ANY (p_quick_filters) AND eb.buyer_app_enabled = true)
            OR (
              'dormant_qtr' = ANY (p_quick_filters)
              AND COALESCE(period_s.invoice_value, 0) = 0
              AND COALESCE(period_prev_s.invoice_value, 0) > 0
            )
            OR ('buying_qtr' = ANY (p_quick_filters) AND COALESCE(period_s.invoice_value, 0) > 0)
            OR (
              'enquire_no_sales' = ANY (p_quick_filters)
              AND (COALESCE(period_s.estimate_value, 0) > 0 OR COALESCE(period_s.order_value, 0) > 0)
              AND COALESCE(period_s.invoice_value, 0) = 0
            )
            OR ('top20' = ANY (p_quick_filters) AND COALESCE(period_s.invoice_value, 0) > 0)
          )
        )
        AND (
          p_status IS NULL
          OR p_status = 'inactive'
          OR (p_status = 'active' AND COALESCE(period_s.invoice_value, 0) > 0)
          OR (p_status = 'dormant' AND COALESCE(period_s.invoice_value, 0) = 0 AND COALESCE(period_prev_s.invoice_value, 0) > 0)
        )
        AND (
          p_buyer_app_filter IS NULL
          OR (p_buyer_app_filter = 'enabled' AND eb.buyer_app_enabled = true)
          OR (p_buyer_app_filter = 'not_enabled' AND eb.buyer_app_enabled = false)
        )
        AND (
          p_outstanding_filter IS NULL
          OR (p_outstanding_filter = 'has_dues' AND COALESCE(now_s.receivable_amount, 0) > 0)
          OR (p_outstanding_filter = 'overdue' AND COALESCE(now_s.overdue_amount, 0) > 0)
        )
      )
  ),
  gmv_rank AS MATERIALIZED (
    SELECT f.id, percent_rank() OVER (ORDER BY f.gmv_90d DESC) AS pct_rank
    FROM filtered f
    WHERE f.gmv_90d > 0
  ),
  paged AS MATERIALIZED (
    SELECT f.*, count(*) OVER () AS result_count
    FROM filtered f
    LEFT JOIN gmv_rank gr ON gr.id = f.id
    WHERE NOT v_want_top20 OR gr.pct_rank <= 0.20
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
    p.result_count,
    p.buyer_app_enabled,
    p.overdue_amount,
    p.invoice_count
  FROM paged p
  ORDER BY p.search_rank DESC, p.business_name ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(
  uuid, text, text[], text, text[], date, date, date, integer, integer, uuid[], date, date, text[], text, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(
  uuid, text, text[], text, text[], date, date, date, integer, integer, uuid[], date, date, text[], text, text, text, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_cohort_composer_buyers(
  uuid, text, text[], text, text[], date, date, date, integer, integer, uuid[], date, date, text[], text, text, text, uuid
) TO service_role;
