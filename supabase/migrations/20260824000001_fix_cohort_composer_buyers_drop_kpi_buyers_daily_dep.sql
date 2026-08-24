-- Fix search_cohort_composer_buyers: remove ALL v1/v2 table dependencies.
--
-- Removed: app.kpi_buyers_daily (dropped 20260723125928) and app.metrics_buyer_snapshot (v2).
-- Source: metrics_buyer_now_summary + metrics_buyer_period_summary (v4 only).
--
-- Column mapping:
--   outstanding_dues <- metrics_buyer_now_summary.receivable_amount
--   last_order_at   <- metrics_buyer_now_summary.last_invoice_date (added 20260808080543)
--   gmv_90d         <- metrics_buyer_period_summary.invoice_value (grain='quarter', current quarter)
--   mtd_spend       <- 0  (no day-grain buyer table post-V1; not rendered in picker UI)
--   orders_mtd      <- 0  (same reason)
--   p_last_order_bucket filter uses last_invoice_date (date comparison, IST-aligned)
--   p_gmv_buckets filter uses invoice_value (quarter-to-date, same trade-off as rest of app)
--
-- metrics_buyer_period_summary is sparse (only buyers with demand activity have a row).
-- LEFT JOIN + COALESCE(…, 0) handles zero-activity buyers correctly.
--
-- Signature unchanged so callers need no update (p_ninety_days_ago / p_month_start /
-- p_next_month_start are kept but no longer read inside the body).

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
  v_quarter_start date := date_trunc('quarter', CURRENT_DATE)::date;
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
  filtered AS MATERIALIZED (
    SELECT
      eb.*,
      now_s.last_invoice_date::timestamptz AS last_order_at,
      COALESCE(now_s.receivable_amount, 0) AS outstanding_dues,
      COALESCE(period_s.invoice_value, 0) AS gmv_90d,
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
    WHERE (
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
