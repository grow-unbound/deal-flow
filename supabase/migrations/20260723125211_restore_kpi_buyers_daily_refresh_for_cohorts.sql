-- Restore periodic refresh of app.kpi_buyers_daily, which app.get_seller_cohort_landing_aggregates
-- still reads directly for its point-in-time cohort-membership attribution
-- (attributed_members_by_day / current_metrics / previous_metrics).
--
-- 20260717080952_metrics_v2_stop_legacy_tenant_refresh.sql removed the live-trigger
-- calls to refresh_kpi_buyers_daily (and several sibling V1 refreshers) on the
-- grounds that "a consumer-read audit (2026-07-17) confirmed zero seller-facing
-- routes read any V1 snapshot/KPI table directly anymore." That audit was wrong
-- for this one table: Cohorts landing depends on it. Live-verified on tenant
-- d601c35c-1a78-4506-a556-a82118d72893: app.kpi_buyers_daily's latest row is
-- 2026-07-14 (frozen for 9+ days as of this migration) — Cohorts' GMV/active-member/
-- conversion figures have been stale since the trigger was removed, independent of
-- (and on top of) the orders-vs-estimates primary-demand-kind bug fixed alongside
-- this in 20260723123407_extend_primary_demand_brands_cohorts.sql. That fix is
-- correct SQL pointed at a table nothing was updating.
--
-- refresh_kpi_buyers_daily(tenant_id, day) is scoped per-tenant-per-day (DELETE +
-- re-INSERT for exactly one day), not a full-history rebuild — restoring it as a
-- periodic batch job (not a live per-write trigger) avoids the write-amplification
-- problem the original migration was fixing (1.4M inserts/712K deletes on
-- buyers_snapshot from firing on every single order/invoice/estimate write).
-- A trailing 3-day window per run covers late-arriving/backdated writes without
-- reprocessing full history each tick.

CREATE OR REPLACE FUNCTION app.refresh_all_kpi_buyers_daily_recent() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  tenant_row RECORD;
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_day date;
BEGIN
  FOR tenant_row IN
    SELECT id FROM app.tenants WHERE deleted_at IS NULL
  LOOP
    FOR v_day IN SELECT generate_series(v_today - 2, v_today, interval '1 day')::date
    LOOP
      PERFORM app.refresh_kpi_buyers_daily(tenant_row.id, v_day);
    END LOOP;
  END LOOP;
END;
$$;

ALTER FUNCTION app.refresh_all_kpi_buyers_daily_recent() OWNER TO postgres;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname = 'kpi-buyers-daily-freshness';

  -- 02:30 IST (21:00 UTC) — free slot between warehouses-snapshot-freshness (02:00)
  -- and reco-buyer-weekly (02:15)/reco-assoc-category-fortnightly (02:45), per the
  -- schedule maintained across 20260719061336_reschedule_cron_ist_spacing.sql and
  -- this session's earlier warehouses-snapshot-freshness addition.
  PERFORM cron.schedule('kpi-buyers-daily-freshness', '0 21 * * *', 'SELECT app.refresh_all_kpi_buyers_daily_recent()');
END;
$$;

-- One-time immediate catch-up so Cohorts isn't stale until tonight's first cron run.
SELECT app.refresh_all_kpi_buyers_daily_recent();
