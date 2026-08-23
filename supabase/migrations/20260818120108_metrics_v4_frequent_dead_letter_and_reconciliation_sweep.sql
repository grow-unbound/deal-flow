-- Metrics V4: shrink the dead-letter self-heal SLA from ~24h to ~15min.
--
-- app.metrics_requeue_dead_letters() (added in
-- 20260809070025_metrics_v4_dead_letter_requeue_and_range_chunking.sql) is
-- only ever invoked from app.metrics_v2_run_daily_reconciliation_sweep(),
-- which runs once daily at 01:00 UTC (cron job "metrics-v2-daily-
-- reconciliation"). Confirmed live on 2026-08-18: 10 commercial/
-- estimate_item rows dead-lettered for the Wine Yard tenant at 09:09 UTC
-- sat dead for 2.5+ hours and would not have revived until the next day's
-- 01:00 UTC sweep -- during which the tenant's commercial snapshot
-- (receivables/overdue/estimates) undercounts real activity. For an idle
-- demo tenant a 24h SLA is fine; for a live pilot tenant taking real writes
-- it is not.
--
-- This adds a standalone, independent cron entry that calls
-- metrics_requeue_dead_letters() every 15 minutes with a matching 15-minute
-- p_min_age (so it never races a row that just landed in dead_letter). It
-- does not touch the existing daily sweep, any RPC, any trigger, or
-- auth.* -- purely additive queue-hygiene cadence.
--
-- metrics_requeue_dead_letters()'s query (WHERE state = 'dead_letter' AND
-- updated_at <= ...) has no dead_letter-covering index today -- every
-- existing partial index on this table targets 'claimed'/'completed'/
-- 'pending'/'retry'. At current table size (~130 rows total) an empty-result
-- run is a sub-millisecond seq scan regardless, but this cron now runs
-- forever at 15-minute cadence instead of once a day, so it gets its own
-- partial index rather than relying on the table staying small.
CREATE INDEX IF NOT EXISTS metrics_dirty_work_dead_letter_idx
  ON app.metrics_dirty_work USING btree (updated_at)
  WHERE (state = 'dead_letter');

CREATE OR REPLACE FUNCTION app.ensure_metrics_v4_dead_letter_requeue_cron_scheduled() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-v4-dead-letter-requeue') THEN
    PERFORM cron.schedule(
      'metrics-v4-dead-letter-requeue',
      '*/15 * * * *',
      $cron$SELECT app.metrics_requeue_dead_letters(interval '15 minutes')$cron$
    );
  END IF;
END;
$$;

ALTER FUNCTION app.ensure_metrics_v4_dead_letter_requeue_cron_scheduled() OWNER TO postgres;
REVOKE ALL ON FUNCTION app.ensure_metrics_v4_dead_letter_requeue_cron_scheduled() FROM PUBLIC;

SELECT app.ensure_metrics_v4_dead_letter_requeue_cron_scheduled();
