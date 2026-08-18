-- Retention pruning for three unbounded operational tables found during the
-- 2026-08-18 Supabase advisors/DB-size review (specs/supabase-advisors-performance-2026-08-18.md).
-- None of these had a pruning job; cron.job_run_details alone was 97MB (19% of
-- the 501MB database) with zero retention, fed by two very-high-frequency ticks
-- (metrics-v2-refresh-tick @ 15s, membership-automatic-refresh-tick @ 30s).
--
-- Mirrors the existing app.metrics_prune_operational_history pattern: batched
-- deletes (FOR UPDATE SKIP LOCKED, capped batch size) called from a scheduled
-- pg_cron job, not a single unbounded DELETE.
--
-- Retention windows chosen:
--   cron.job_run_details        -> 3 days.  Longer than the app's own hourly
--     metrics-prune jobs (7 days) would suggest, but this table's write rate
--     (~8,600 rows/day from the two sub-minute tick jobs) is an order of
--     magnitude higher than anything else being pruned in this codebase, so a
--     shorter window keeps it small while still covering a couple of days of
--     tick-job history for debugging (relevant to the known v4 tick reliability
--     issues tracked separately).
--   app.realtime_notifications  -> 1 day.  Pure WAL-derived broadcast staging —
--     once a client has received the realtime event there is no reason to keep
--     the row; 24h is already generous headroom for a client that reconnects
--     after a short outage.
--   app.integration_webhook_events -> 14 days, and only rows in a terminal
--     processing_status ('processed' or 'ignored'). Unlike the other two, this
--     table is genuine integration-debugging audit trail (Zoho webhook payloads)
--     — support conversations about "an order didn't sync N days ago" commonly
--     look back further than a week, so 14 days rather than 7. Rows still
--     'received' or 'failed' are never pruned by age alone since those need
--     manual triage regardless of how old they are.

CREATE OR REPLACE FUNCTION app.prune_cron_job_run_details(p_before timestamp with time zone, p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'cron', 'pg_temp'
AS $function$
DECLARE v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT runid FROM cron.job_run_details
    WHERE end_time < p_before
    ORDER BY end_time LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  ) DELETE FROM cron.job_run_details r USING doomed d WHERE r.runid = d.runid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION app.prune_realtime_notifications(p_before timestamp with time zone, p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
DECLARE v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT id FROM app.realtime_notifications
    WHERE created_at < p_before
    ORDER BY created_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.realtime_notifications n USING doomed d WHERE n.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION app.prune_integration_webhook_events(p_before timestamp with time zone, p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
DECLARE v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT id FROM app.integration_webhook_events
    WHERE created_at < p_before
      AND processing_status IN ('processed', 'ignored')
    ORDER BY created_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.integration_webhook_events e USING doomed d WHERE e.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- Hourly with a larger batch (not the 6-hourly/1000 first drafted) so the
-- existing 97MB backlog (~78k rows, mostly older than 3 days already) catches
-- up in a couple of days instead of ~2 weeks, while still bounded per run.
SELECT cron.schedule(
  'prune-cron-job-run-details',
  '13 * * * *',
  $$SELECT app.prune_cron_job_run_details(now() - interval '3 days', 5000)$$
);

SELECT cron.schedule(
  'prune-realtime-notifications',
  '27 * * * *',
  $$SELECT app.prune_realtime_notifications(now() - interval '1 day', 1000)$$
);

SELECT cron.schedule(
  'prune-integration-webhook-events',
  '35 3 * * *',
  $$SELECT app.prune_integration_webhook_events(now() - interval '14 days', 1000)$$
);
