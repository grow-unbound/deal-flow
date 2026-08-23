-- Follow-up to 20260818080241_add_retention_pruning_jobs.sql.
--
-- Bug found during manual verification (2026-08-23, see specs/supabase-advisors-
-- performance-2026-08-18.md fix log): all three prune functions clamped their
-- batch size to a hardcoded ceiling of 1000, copied verbatim from the existing
-- app.metrics_prune_operational_history pattern without adjusting it. The
-- cron.schedule for prune-cron-job-run-details passes p_limit=5000, but the
-- function silently capped every call to 1000 regardless — the intended larger
-- batch for this table's much higher write rate never actually applied.
--
-- Fix: raise the internal ceiling on all three (job_run_details to 10000, the
-- other two to 5000 — headroom above their current 1000 default, not a change
-- to the defaults themselves) so a caller-supplied p_limit above 1000 is
-- actually honored instead of silently clamped.
--
-- Also adds a plain (non-FULL) VACUUM ANALYZE maintenance job for these three
-- tables. This is NOT a substitute for VACUUM FULL — plain VACUUM reclaims dead
-- rows for reuse and refreshes planner stats, but does not shrink the on-disk
-- file size or return space to the OS (that needs VACUUM FULL, which takes an
-- ACCESS EXCLUSIVE lock and is deliberately NOT auto-scheduled here — it was
-- run manually on 2026-08-23 with explicit confirmation given the live-app lock
-- risk, and should stay a manual/on-demand action, not something that fires
-- unattended on a schedule). Routine VACUUM ANALYZE just keeps steady-state
-- bloat and stats from silently drifting between manual checks.

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
    ORDER BY end_time LIMIT LEAST(GREATEST(p_limit, 1), 10000)
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
    ORDER BY created_at LIMIT LEAST(GREATEST(p_limit, 1), 5000)
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
    ORDER BY created_at LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.integration_webhook_events e USING doomed d WHERE e.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- Plain VACUUM cannot run inside a transaction block or from within a PL/pgSQL
-- function body (Postgres restriction) — pg_cron runs each scheduled command in
-- its own top-level, non-nested execution, so it's scheduled directly as raw
-- SQL here rather than wrapped in an app.* function like the prune jobs above.
SELECT cron.schedule(
  'vacuum-pruned-operational-tables',
  '50 2 * * *',
  $$VACUUM (ANALYZE) cron.job_run_details; VACUUM (ANALYZE) app.realtime_notifications; VACUUM (ANALYZE) app.integration_webhook_events;$$
);
