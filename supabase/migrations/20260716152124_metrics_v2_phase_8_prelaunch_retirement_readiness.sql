-- Metrics V2 Phase 8: pre-launch retirement readiness.
--
-- Keep legacy V1 tables/functions physically present for the observation window,
-- but remove the last app-facing reads from high-cardinality V1 buyer/product
-- daily sources and buyer snapshots.

CREATE OR REPLACE FUNCTION app.get_metrics_v2_customer_summary(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, public
SET statement_timeout = '3s'
SET lock_timeout = '100ms'
AS $$
DECLARE
  v_location_scoped boolean := COALESCE(cardinality(p_location_ids), 0) > 0;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  WITH tenant_metrics AS (
    SELECT
      b.id AS buyer_id,
      b.is_active,
      GREATEST(bs.last_invoice_at, bs.last_estimate_at, bs.last_order_at) AS last_activity_at,
      bs.receivable_amount,
      bs.overdue_amount,
      bs.source_watermark,
      bs.computed_at
    FROM app.buyers b
    LEFT JOIN app.metrics_buyer_snapshot bs
      ON bs.tenant_id = b.tenant_id
     AND bs.buyer_id = b.id
     AND bs.deleted_at IS NULL
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND NOT v_location_scoped
  ),
  scoped_metrics AS (
    SELECT
      b.id AS buyer_id,
      b.is_active,
      GREATEST(
        MAX(bls.last_invoice_at),
        MAX(bls.last_estimate_at),
        MAX(bls.last_order_at)
      ) AS last_activity_at,
      COALESCE(SUM(bls.receivable_amount), 0)::numeric AS receivable_amount,
      COALESCE(SUM(bls.overdue_amount), 0)::numeric AS overdue_amount,
      MAX(bls.source_watermark) AS source_watermark,
      MAX(bls.computed_at) AS computed_at
    FROM app.buyers b
    JOIN app.metrics_buyer_location_snapshot bls
      ON bls.tenant_id = b.tenant_id
     AND bls.buyer_id = b.id
     AND bls.location_id = ANY (p_location_ids)
     AND bls.deleted_at IS NULL
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND v_location_scoped
    GROUP BY b.id, b.is_active
  ),
  metrics AS (
    SELECT * FROM tenant_metrics
    UNION ALL
    SELECT * FROM scoped_metrics
  )
  SELECT jsonb_build_object(
    'total_count', COUNT(*)::bigint,
    'active_count', COUNT(*) FILTER (
      WHERE is_active
        AND (
          last_activity_at IS NULL
          OR last_activity_at >= p_as_of - interval '90 days'
        )
    )::bigint,
    'dormant_count', COUNT(*) FILTER (
      WHERE is_active
        AND last_activity_at IS NOT NULL
        AND last_activity_at < p_as_of - interval '90 days'
    )::bigint,
    'due_count', COUNT(*) FILTER (WHERE COALESCE(receivable_amount, 0) > 0)::bigint,
    'overdue_count', COUNT(*) FILTER (WHERE COALESCE(overdue_amount, 0) > 0)::bigint,
    'outstanding_dues', COALESCE(SUM(receivable_amount), 0)::numeric,
    'overdue_amount', COALESCE(SUM(overdue_amount), 0)::numeric,
    'refreshed_at', MAX(COALESCE(computed_at, source_watermark)),
    'as_of', p_as_of,
    'commercial_horizon_days', 90,
    'table_period', NULL
  )
  INTO v_result
  FROM metrics;

  RETURN v_result;
END;
$$;

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
SET statement_timeout = '3s'
SET lock_timeout = '100ms'
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
  filtered AS MATERIALIZED (
    SELECT
      eb.*,
      bs.last_order_at,
      COALESCE(bs.receivable_amount, 0) AS outstanding_dues,
      COALESCE(bs.order_value_90d, 0) AS gmv_90d
    FROM eligible_buyers eb
    LEFT JOIN app.metrics_buyer_snapshot bs
      ON bs.tenant_id = p_tenant_id
     AND bs.buyer_id = eb.id
     AND bs.deleted_at IS NULL
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
        OR ('gmv_0' = ANY (p_gmv_buckets) AND COALESCE(bs.order_value_90d, 0) <= 0)
        OR ('gmv_1_50000' = ANY (p_gmv_buckets) AND COALESCE(bs.order_value_90d, 0) > 0 AND COALESCE(bs.order_value_90d, 0) <= 50000)
        OR ('gmv_50001_200000' = ANY (p_gmv_buckets) AND COALESCE(bs.order_value_90d, 0) > 50000 AND COALESCE(bs.order_value_90d, 0) <= 200000)
        OR ('gmv_200001_500000' = ANY (p_gmv_buckets) AND COALESCE(bs.order_value_90d, 0) > 200000 AND COALESCE(bs.order_value_90d, 0) <= 500000)
        OR ('gmv_500001_plus' = ANY (p_gmv_buckets) AND COALESCE(bs.order_value_90d, 0) > 500000)
      )
  ),
  paged AS MATERIALIZED (
    SELECT f.*, count(*) OVER () AS result_count
    FROM filtered f
    ORDER BY f.search_rank DESC, f.business_name ASC, f.id ASC
    LIMIT v_limit
    OFFSET v_offset
  ),
  month_orders AS (
    SELECT
      o.buyer_id,
      COALESCE(SUM(o.total_amount), 0)::numeric AS mtd_spend,
      COUNT(*)::bigint AS orders_mtd
    FROM app.orders o
    JOIN paged p ON p.id = o.buyer_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) >= p_month_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p_next_month_start
    GROUP BY o.buyer_id
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
    COALESCE(m.mtd_spend, 0)::numeric AS mtd_spend,
    COALESCE(m.orders_mtd, 0)::bigint AS orders_mtd,
    p.result_count
  FROM paged p
  LEFT JOIN month_orders m ON m.buyer_id = p.id
  ORDER BY p.search_rank DESC, p.business_name ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION app.get_metrics_v2_customer_summary(uuid, uuid[], timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.get_metrics_v2_customer_summary(uuid, uuid[], timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) TO service_role;

COMMENT ON FUNCTION app.get_metrics_v2_customer_summary(uuid, uuid[], timestamptz) IS
  'Metrics V2 Phase 8 customer summary over V2 buyer snapshots. Replaces app reads from buyers_snapshot.';
COMMENT ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) IS
  'Metrics V2 Phase 8 cohort composer search over V2 buyer snapshots plus bounded page-level month-order aggregation.';
