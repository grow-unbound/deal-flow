-- Phase 5 of the yukti-prod DB recovery (see specs/db-perf-recovery-2026-09-20.md).
--
-- 1. app.run_storage_maintenance() ran seven purges in ONE transaction. Step 3
--    (app.purge_integration_webhook_events) deleted every webhook event older than 7 days,
--    ignoring status and child rows (integration_webhook_errors / _event_changes / replay_of),
--    so it failed with an FK violation and rolled back ALL steps -- none of the purges has
--    completed through this job. It would also have destroyed unprocessed/failed events.
--    Fix: only processed/ignored events with no child rows (same policy as
--    app.prune_integration_webhook_events), batched; each maintenance step is isolated so one
--    failure cannot roll back the others; membership dead letters get a retention.
-- 2. De-collide cron schedules so heavy jobs do not start in the same second (01:00 metrics
--    pair, 03:35 pair, */15 requeue pair, hourly sweep at :00 = the Zoho 19:00 sync start) and so
--    the requeue jobs never coincide with the */5 metrics tick. Each change is guarded on the
--    current schedule, so replays and manually retuned jobs are left alone. `active` is untouched.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION app.purge_integration_webhook_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM app.integration_webhook_events e
  WHERE e.id IN (
    SELECT w.id
    FROM app.integration_webhook_events w
    WHERE w.created_at < now() - interval '7 days'
      AND w.processing_status IN ('processed', 'ignored')
      AND NOT EXISTS (SELECT 1 FROM app.integration_webhook_errors x WHERE x.integration_webhook_event_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM app.integration_webhook_event_changes x WHERE x.integration_webhook_event_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM app.integration_webhook_events x WHERE x.replay_of_event_id = w.id)
    ORDER BY w.created_at
    LIMIT 5000
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.prune_integration_webhook_events(p_before timestamptz, p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $$
DECLARE v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT w.id FROM app.integration_webhook_events w
    WHERE w.created_at < p_before
      AND w.processing_status IN ('processed', 'ignored')
      AND NOT EXISTS (SELECT 1 FROM app.integration_webhook_errors x WHERE x.integration_webhook_event_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM app.integration_webhook_event_changes x WHERE x.integration_webhook_event_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM app.integration_webhook_events x WHERE x.replay_of_event_id = w.id)
    ORDER BY w.created_at LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.integration_webhook_events e USING doomed d WHERE e.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION app.run_storage_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
DECLARE
  v_step text;
BEGIN
  FOREACH v_step IN ARRAY ARRAY[
    'purge_cron_job_run_details',
    'purge_metrics_dirty_work',
    'purge_integration_webhook_events',
    'purge_integration_analytics_events',
    'purge_net_http_response',
    'purge_supabase_hooks',
    'purge_otp_sessions',
    'purge_membership_dead_letters'
  ] LOOP
    BEGIN
      IF v_step = 'purge_membership_dead_letters' THEN
        DELETE FROM app.membership_dirty_work
        WHERE state = 'dead_letter' AND updated_at < now() - interval '14 days';
      ELSE
        EXECUTE format('SELECT app.%I()', v_step);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One failing step must not roll back the others.
      RAISE WARNING 'storage_maintenance step % failed: %', v_step, SQLERRM;
    END;
  END LOOP;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT j.jobid, j.jobname, v.new_schedule
    FROM (VALUES
      ('metrics-v4-top80-daily',           '0 1 * * *',    '10 1 * * *'),
      ('whatsapp-queue-sweep',             '35 3 * * *',   '40 3 * * *'),
      ('membership-dead-letter-requeue',   '*/15 * * * *', '2-59/15 * * * *'),
      ('metrics-v4-dead-letter-requeue',   '*/15 * * * *', '7-59/15 * * * *'),
      ('sync-cron-idle-sweep',             '0 * * * *',    '3 * * * *')
    ) AS v(jobname, old_schedule, new_schedule)
    JOIN cron.job j ON j.jobname = v.jobname AND j.schedule = v.old_schedule
  LOOP
    PERFORM cron.alter_job(job_id := r.jobid, schedule := r.new_schedule);
  END LOOP;
END;
$$;
