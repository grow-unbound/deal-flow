-- Reconciliation for app.get_seller_cohort_landing_aggregates's point-in-time cohort
-- attribution (supabase/migrations/20260723011321_cohort_landing_aggregates_point_in_time.sql).
--
-- The RPC's attributed_members_by_day CTE joins each app.kpi_buyers_daily row to whichever
-- cohort the buyer was actively in (per app.cohort_members.valid_from/valid_until) on that
-- specific day, not whichever cohort they're in right now. This script recomputes
-- current-period gmv_mtd/orders_mtd/active_members independently, straight from
-- app.kpi_buyers_daily + app.cohort_members, and diffs against calling the RPC directly for
-- every cohort in each tenant.
--
-- A mismatch here means either: the RPC's CTE has a bug, or cached_member_count/kpi data has
-- drifted since the RPC's own snapshot inputs were last refreshed (kpi_buyers_daily is itself
-- a separately-reconciled fact table -- see raw-vs-v2-buyer.sql / raw-vs-v2-daily.sql for its
-- own correctness). Current-period window here is IST month-to-date, matching the other
-- scripts in this directory.
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-cohort-attribution.sql
--
-- Read-only: no writes, no schema changes.

WITH v_now AS (
  SELECT
    clock_timestamp() AS now_ts,
    date_trunc('month', clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS month_start
), tenants AS (
  SELECT t.id AS tenant_id
  FROM app.tenants t
  WHERE t.deleted_at IS NULL
), cohort_universe AS (
  SELECT c.id, c.tenant_id, c.created_at
  FROM app.cohorts c
  WHERE c.deleted_at IS NULL
), -- Independent raw recompute: attribute each buyer-day to the cohort they were actively in
   -- on that day, per the cohort_members SCD2 window, then sum kpi_buyers_daily for the
   -- current IST month-to-date.
attributed_members_by_day AS (
  SELECT DISTINCT ON (k.tenant_id, k.buyer_id, k.day) k.tenant_id, k.buyer_id, k.day, cm.cohort_id
  FROM app.kpi_buyers_daily k
  JOIN app.cohort_members cm ON cm.buyer_id = k.buyer_id
    AND (cm.valid_from AT TIME ZONE 'Asia/Kolkata')::date <= k.day
    AND (cm.valid_until IS NULL OR (cm.valid_until AT TIME ZONE 'Asia/Kolkata')::date > k.day)
  JOIN cohort_universe c ON c.id = cm.cohort_id AND c.tenant_id = k.tenant_id
  WHERE k.scope = 'tenant'
    AND k.location_id IS NULL
    AND k.day >= (SELECT month_start FROM v_now)
    AND k.day < ((SELECT now_ts FROM v_now) AT TIME ZONE 'Asia/Kolkata')::date + 1
  ORDER BY k.tenant_id, k.buyer_id, k.day, c.created_at DESC, c.id
), raw_cohort_metrics AS (
  SELECT
    amd.tenant_id, amd.cohort_id,
    COALESCE(SUM(k.orders_gmv), 0)::numeric AS raw_gmv_mtd,
    COALESCE(SUM(k.orders_count), 0)::bigint AS raw_orders_mtd,
    COUNT(DISTINCT k.buyer_id) FILTER (WHERE k.orders_count > 0)::bigint AS raw_active_members
  FROM app.kpi_buyers_daily k
  JOIN attributed_members_by_day amd ON amd.buyer_id = k.buyer_id AND amd.day = k.day AND amd.tenant_id = k.tenant_id
  WHERE k.scope = 'tenant'
    AND k.location_id IS NULL
    AND k.day >= (SELECT month_start FROM v_now)
    AND k.day < ((SELECT now_ts FROM v_now) AT TIME ZONE 'Asia/Kolkata')::date + 1
  GROUP BY amd.tenant_id, amd.cohort_id
), rpc_side AS (
  SELECT
    tn.tenant_id,
    (row_metric ->> 'id')::uuid AS cohort_id,
    (row_metric ->> 'gmv_mtd')::numeric AS rpc_gmv_mtd,
    (row_metric ->> 'orders_mtd')::bigint AS rpc_orders_mtd,
    (row_metric ->> 'active_members')::bigint AS rpc_active_members
  FROM tenants tn
  CROSS JOIN LATERAL (
    SELECT app.get_seller_cohort_landing_aggregates(
      tn.tenant_id,
      ARRAY(SELECT id FROM cohort_universe WHERE tenant_id = tn.tenant_id),
      (SELECT month_start FROM v_now)::timestamptz,
      ((SELECT now_ts FROM v_now) AT TIME ZONE 'Asia/Kolkata')::date + 1,
      (date_trunc('month', (SELECT month_start FROM v_now) - INTERVAL '1 day'))::date::timestamptz,
      (SELECT month_start FROM v_now)::timestamptz,
      '{}'::jsonb,
      false
    ) AS payload
  ) rpc_call
  CROSS JOIN LATERAL jsonb_array_elements(rpc_call.payload -> 'row_metrics') AS row_metric
), diffed AS (
  SELECT
    COALESCE(r.tenant_id, rc.tenant_id) AS tenant_id,
    COALESCE(r.cohort_id, rc.cohort_id) AS cohort_id,
    unnest(ARRAY['gmv_mtd', 'orders_mtd', 'active_members']) AS metric,
    unnest(ARRAY[r.raw_gmv_mtd, r.raw_orders_mtd::numeric, r.raw_active_members::numeric]) AS raw_value,
    unnest(ARRAY[rc.rpc_gmv_mtd, rc.rpc_orders_mtd::numeric, rc.rpc_active_members::numeric]) AS rpc_value
  FROM raw_cohort_metrics r
  FULL OUTER JOIN rpc_side rc ON rc.tenant_id = r.tenant_id AND rc.cohort_id = r.cohort_id
)
SELECT
  tenant_id,
  cohort_id,
  metric,
  raw_value,
  rpc_value,
  CASE WHEN rpc_value IS NULL THEN 'NO_RPC_ROW'
       WHEN ABS(COALESCE(raw_value, 0) - COALESCE(rpc_value, 0)) <= 0.01 THEN 'MATCH'
       ELSE 'MISMATCH' END AS verdict,
  ROUND(COALESCE(raw_value, 0) - COALESCE(rpc_value, 0), 2) AS diff
FROM diffed
ORDER BY (CASE WHEN rpc_value IS NULL OR ABS(COALESCE(raw_value, 0) - COALESCE(rpc_value, 0)) > 0.01 THEN 0 ELSE 1 END), tenant_id, cohort_id, metric;
