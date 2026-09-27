-- Pulse "dormant customers" opportunity: rolling-window dormancy read.
--
-- Dormant = active buyer whose last invoice day (app.metrics_buyer_now_summary.last_invoice_date,
-- the same column behind the cohort composer's "Dormant 90+ days" last-order bucket) is more than
-- p_dormant_days days before p_as_of (default 90; app rule is `last_invoice_date < today - 90`).
-- Ranked by invoice value over the trailing 12 months, taken from the monthly grain of
-- app.metrics_buyer_period_summary, so nothing depends on calendar-quarter rollover.
--
-- Reads only per-tenant summary tables (bounded by buyers x 12 monthly rows); no invoice/order/
-- estimate scans. Exact total_count and total_value_12m are returned on every row (window aggregates) while the caller pages
-- through a bounded LIMIT/OFFSET. Callable only by service_role (Pulse API routes, seller_admin only).

CREATE OR REPLACE FUNCTION app.get_pulse_dormant_buyers(
  p_tenant_id uuid,
  p_as_of date,
  p_dormant_days integer DEFAULT 90,
  p_min_value numeric DEFAULT 10000,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  buyer_id uuid,
  business_name text,
  last_invoice_date date,
  days_since_last_invoice integer,
  value_12m numeric,
  invoice_count_12m bigint,
  source_watermark timestamptz,
  computed_at timestamptz,
  total_count bigint,
  total_value_12m numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  WITH params AS (
    SELECT
      p_as_of AS as_of,
      GREATEST(COALESCE(p_dormant_days, 90), 1) AS dormant_days,
      (date_trunc('month', p_as_of::timestamp - interval '12 months'))::date AS value_from
  ),
  dormant AS (
    SELECT ns.buyer_id, ns.last_invoice_date, ns.source_watermark, ns.computed_at
    FROM app.metrics_buyer_now_summary ns, params pr
    WHERE ns.tenant_id = p_tenant_id
      AND ns.deleted_at IS NULL
      AND ns.last_invoice_date IS NOT NULL
      AND ns.last_invoice_date < pr.as_of - pr.dormant_days
  ),
  valued AS (
    SELECT p.buyer_id, SUM(p.invoice_value) AS value_12m, SUM(p.invoice_count) AS invoice_count_12m
    FROM app.metrics_buyer_period_summary p, params pr
    WHERE p.tenant_id = p_tenant_id
      AND p.grain = 'month'
      AND p.deleted_at IS NULL
      AND p.period_start >= pr.value_from
    GROUP BY p.buyer_id
    HAVING SUM(p.invoice_value) >= GREATEST(COALESCE(p_min_value, 0), 0.01)
  )
  SELECT
    d.buyer_id,
    b.business_name,
    d.last_invoice_date,
    (pr.as_of - d.last_invoice_date)::integer AS days_since_last_invoice,
    v.value_12m,
    v.invoice_count_12m,
    d.source_watermark,
    d.computed_at,
    COUNT(*) OVER () AS total_count,
    SUM(v.value_12m) OVER () AS total_value_12m
  FROM dormant d
  JOIN valued v ON v.buyer_id = d.buyer_id
  JOIN app.buyers b
    ON b.id = d.buyer_id
   AND b.tenant_id = p_tenant_id
   AND b.is_active
   AND b.deleted_at IS NULL
  CROSS JOIN params pr
  ORDER BY v.value_12m DESC, d.buyer_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION app.get_pulse_dormant_buyers(uuid, date, integer, numeric, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_pulse_dormant_buyers(uuid, date, integer, numeric, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_pulse_dormant_buyers(uuid, date, integer, numeric, integer, integer) TO service_role;
