-- Nightly drift check for derived tenant month/quarter rows.
--
-- Step 5 of specs/metrics-v4-period-rollup-design-2026-08-04.md, and a hard
-- prerequisite of step 4 rather than a nice-to-have.
--
-- Step 4 stopped recomputing month/quarter from raw and started deriving them
-- from this tenant's 'day' rows plus metrics_buyer_period_summary /
-- metrics_product_period_summary. That removed a cost that grew all quarter,
-- but it also means a month/quarter row is no longer independently correct --
-- it inherits any error in the rows it reads. A missed dirty-mark that leaves a
-- day row stale now propagates upward silently.
--
-- This is the detector for exactly that. It recomputes the derived grains FROM
-- RAW for a bounded set of recent periods and records any disagreement, so
-- drift surfaces as a queryable row instead of a wrong number on a dashboard.
--
-- Bounded deliberately: current and previous month, current and previous
-- quarter, per tenant. That is 4 periods -- the cost this design was removing
-- from the 15s tick is fine to pay once a day.

CREATE TABLE IF NOT EXISTS app.metrics_v4_period_drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  measure text NOT NULL,
  stored_value numeric,
  expected_value numeric,
  detected_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS metrics_v4_period_drift_log_detected_idx
  ON app.metrics_v4_period_drift_log (detected_at DESC);

CREATE OR REPLACE FUNCTION app.metrics_v4_check_period_drift(
  p_tenant_id uuid DEFAULT NULL,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $fn$
DECLARE
  v_today date := (p_as_of AT TIME ZONE 'Asia/Kolkata')::date;
  v_found integer := 0;
BEGIN
  WITH periods AS (
    SELECT 'month'::text AS grain, date_trunc('month', v_today)::date AS ps,
           (date_trunc('month', v_today) + interval '1 month')::date AS pe
    UNION ALL SELECT 'month', (date_trunc('month', v_today) - interval '1 month')::date,
           date_trunc('month', v_today)::date
    UNION ALL SELECT 'quarter', date_trunc('quarter', v_today)::date,
           (date_trunc('quarter', v_today) + interval '3 months')::date
    UNION ALL SELECT 'quarter', (date_trunc('quarter', v_today) - interval '3 months')::date,
           date_trunc('quarter', v_today)::date
  ),
  stored AS (
    SELECT s.tenant_id, s.grain, s.period_start, s.period_end_exclusive,
           s.invoice_count, s.invoice_value, s.invoice_buyer_count,
           s.estimate_count, s.estimate_value, s.order_count
    FROM app.metrics_tenant_period_summary s
    JOIN periods p ON p.grain = s.grain AND p.ps = s.period_start
    WHERE s.deleted_at IS NULL
      AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
  ),
  truth AS (
    SELECT st.tenant_id, st.grain, st.period_start,
      (SELECT count(*) FROM app.invoices i WHERE i.tenant_id = st.tenant_id AND i.deleted_at IS NULL
         AND app.invoice_status_gmv_included(i.status)
         AND app.metric_day_ist(i.invoice_date, i.created_at) >= st.period_start
         AND app.metric_day_ist(i.invoice_date, i.created_at) <  st.period_end_exclusive) AS invoice_count,
      (SELECT COALESCE(sum(i.total_amount),0) FROM app.invoices i WHERE i.tenant_id = st.tenant_id AND i.deleted_at IS NULL
         AND app.invoice_status_gmv_included(i.status)
         AND app.metric_day_ist(i.invoice_date, i.created_at) >= st.period_start
         AND app.metric_day_ist(i.invoice_date, i.created_at) <  st.period_end_exclusive) AS invoice_value,
      (SELECT count(DISTINCT i.buyer_id) FROM app.invoices i WHERE i.tenant_id = st.tenant_id AND i.deleted_at IS NULL
         AND app.invoice_status_gmv_included(i.status)
         AND app.metric_day_ist(i.invoice_date, i.created_at) >= st.period_start
         AND app.metric_day_ist(i.invoice_date, i.created_at) <  st.period_end_exclusive) AS invoice_buyer_count,
      (SELECT count(*) FROM app.estimates e WHERE e.tenant_id = st.tenant_id AND e.deleted_at IS NULL
         AND app.estimate_status_counts_as_demand(e.status)
         AND app.metric_day_ist(e.estimate_date, e.created_at) >= st.period_start
         AND app.metric_day_ist(e.estimate_date, e.created_at) <  st.period_end_exclusive) AS estimate_count,
      (SELECT COALESCE(sum(e.total_amount),0) FROM app.estimates e WHERE e.tenant_id = st.tenant_id AND e.deleted_at IS NULL
         AND app.estimate_status_counts_as_demand(e.status)
         AND app.metric_day_ist(e.estimate_date, e.created_at) >= st.period_start
         AND app.metric_day_ist(e.estimate_date, e.created_at) <  st.period_end_exclusive) AS estimate_value,
      (SELECT count(*) FROM app.orders o WHERE o.tenant_id = st.tenant_id AND o.deleted_at IS NULL
         AND app.order_status_in_flow(o.status)
         AND app.metric_day_ist(o.order_date, o.created_at) >= st.period_start
         AND app.metric_day_ist(o.order_date, o.created_at) <  st.period_end_exclusive) AS order_count
    FROM stored st
  ),
  mismatches AS (
    SELECT s.tenant_id, s.grain, s.period_start, m.measure, m.stored_value, m.expected_value
    FROM stored s
    JOIN truth t ON t.tenant_id = s.tenant_id AND t.grain = s.grain AND t.period_start = s.period_start
    CROSS JOIN LATERAL (VALUES
      ('invoice_count',       s.invoice_count::numeric,       t.invoice_count::numeric),
      ('invoice_value',       s.invoice_value,                t.invoice_value),
      ('invoice_buyer_count', s.invoice_buyer_count::numeric, t.invoice_buyer_count::numeric),
      ('estimate_count',      s.estimate_count::numeric,      t.estimate_count::numeric),
      ('estimate_value',      s.estimate_value,               t.estimate_value),
      ('order_count',         s.order_count::numeric,         t.order_count::numeric)
    ) AS m(measure, stored_value, expected_value)
    WHERE m.stored_value IS DISTINCT FROM m.expected_value
  )
  INSERT INTO app.metrics_v4_period_drift_log (tenant_id, grain, period_start, measure, stored_value, expected_value)
  SELECT tenant_id, grain, period_start, measure, stored_value, expected_value FROM mismatches;

  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF v_found > 0 THEN
    -- Surfaces in the Postgres log as well as the table. The current period is
    -- expected to differ transiently while documents are still arriving, so
    -- treat a single current-period row as noise and a previous-period row --
    -- or a persistent current-period one -- as real.
    RAISE WARNING 'metrics_v4_period_drift: % mismatch(es) recorded, see app.metrics_v4_period_drift_log', v_found;
  END IF;

  RETURN v_found;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.ensure_metrics_v4_drift_check_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-v4-period-drift-check') THEN
    -- 02:40 UTC = 08:10 IST, after the 01:00 reconciliation sweep and well
    -- clear of the 19:00 UTC Zoho incremental.
    PERFORM cron.schedule(
      'metrics-v4-period-drift-check',
      '40 2 * * *',
      'SELECT app.metrics_v4_check_period_drift()'
    );
  END IF;
END;
$fn$;

SELECT app.ensure_metrics_v4_drift_check_cron_scheduled();
