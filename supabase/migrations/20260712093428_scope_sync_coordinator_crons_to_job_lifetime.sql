-- Scope sync-coordinator-tick (15s) and sync-reaper-backstop (1min) to the
-- lifetime of an actual sync run instead of running forever, 24/7.
--
-- Zoho sync only runs once a day for a bounded window (zoho-sync-daily,
-- ~04:00 IST — see the companion migration preponing this to 4am), yet both
-- crons were standing schedules ticking around the clock. Cadence itself is
-- NOT changed here — the 15s tick is what moves jobs to completed/failed
-- quickly and stays exactly as fast. What changes is that both jobs are
-- armed only when a sync_run master enters pending/running, and disarmed
-- once no sync_run master is active — mirroring the exact
-- ensure_*_cron_scheduled + self-unschedule-when-idle idiom this codebase
-- already used for the old self-terminating zoho orchestrator (see archived
-- migration 20260705023246_self_terminating_sync_cron.sql).

-- ── Reaper gets the same idempotent "ensure scheduled" wrapper the
--    coordinator tick already has (app.ensure_sync_coordinator_cron_scheduled,
--    added in 20260710071310) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.ensure_reaper_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-reaper-backstop') THEN
    PERFORM cron.schedule('sync-reaper-backstop', '*/1 * * * *', 'SELECT app.reap_stale_sync_jobs()');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.ensure_reaper_cron_scheduled() FROM PUBLIC;
GRANT ALL ON FUNCTION app.ensure_reaper_cron_scheduled() TO service_role;

-- ── Arm both crons the moment a sync_run master goes pending/running ──────
CREATE OR REPLACE FUNCTION app.arm_sync_coordinator_crons()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
  PERFORM app.ensure_sync_coordinator_cron_scheduled();
  PERFORM app.ensure_reaper_cron_scheduled();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.arm_sync_coordinator_crons() FROM PUBLIC;
GRANT ALL ON FUNCTION app.arm_sync_coordinator_crons() TO service_role;

DROP TRIGGER IF EXISTS integration_sync_jobs_arm_coordinator_crons ON app.integration_sync_jobs;

CREATE TRIGGER integration_sync_jobs_arm_coordinator_crons
AFTER INSERT OR UPDATE OF status ON app.integration_sync_jobs
FOR EACH ROW
WHEN (NEW.phase = 'sync_run' AND NEW.status IN ('pending', 'running'))
EXECUTE FUNCTION app.arm_sync_coordinator_crons();

-- ── Disarm both crons once no sync_run master is active. Appended to the
--    reaper (already runs every 1 min while armed) rather than the 15s tick,
--    so the idle check itself isn't on the hot path. A 2-minute grace period
--    after the last sync_run master went terminal avoids racing a coordinator
--    tick that's still cleaning up trailing slave state. ─────────────────
CREATE OR REPLACE FUNCTION app.reap_stale_sync_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_running_stale_after  interval := interval '5 minutes';
  v_dispatch_lost_after  interval := interval '1 minute';
  v_max_attempts         int      := 3;
  v_backoff_base_secs    numeric  := 30;
  v_backoff_multiplier   numeric  := 3;
BEGIN
  -- 1. Running slaves stale beyond lease, still under the revival cap,
  --    belonging to a still-active master → bounded revive.
  UPDATE app.integration_sync_jobs j
  SET status                 = 'pending',
      attempt_count           = COALESCE(j.attempt_count, 0) + 1,
      next_retry_eligible_at  = now() + make_interval(secs => v_backoff_base_secs * power(v_backoff_multiplier, COALESCE(j.attempt_count, 0))),
      updated_at              = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_running_stale_after
    AND COALESCE(j.attempt_count, 0) < v_max_attempts
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs m
      WHERE m.id = j.master_job_id AND m.phase = 'sync_run' AND m.status IN ('pending', 'running', 'paused')
    );

  -- 2. Running slaves stale beyond lease, revival cap already exhausted,
  --    still belonging to an active master → permanently fail.
  UPDATE app.integration_sync_jobs j
  SET status       = 'failed',
      attempt_count = COALESCE(j.attempt_count, 0) + 1,
      error_log    = jsonb_build_object(
        'message',   'reaped: exceeded revival cap while stalled in running state with no heartbeat',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_running_stale_after
    AND COALESCE(j.attempt_count, 0) >= v_max_attempts
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs m
      WHERE m.id = j.master_job_id AND m.phase = 'sync_run' AND m.status IN ('pending', 'running', 'paused')
    );

  -- 3. Pending slaves whose dispatch was lost, still under cap, belonging to
  --    a still-active master → bounded revive.
  UPDATE app.integration_sync_jobs j
  SET attempt_count           = COALESCE(j.attempt_count, 0) + 1,
      next_retry_eligible_at  = now() + make_interval(secs => v_backoff_base_secs * power(v_backoff_multiplier, COALESCE(j.attempt_count, 0))),
      updated_at              = now()
  WHERE j.status = 'pending'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.master_job_id IS NOT NULL
    AND j.updated_at < now() - v_dispatch_lost_after
    AND (j.next_retry_eligible_at IS NULL OR j.next_retry_eligible_at < now())
    AND COALESCE(j.attempt_count, 0) < v_max_attempts
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs m
      WHERE m.id = j.master_job_id AND m.phase = 'sync_run' AND m.status IN ('pending', 'running', 'paused')
    );

  -- 4. Pending slaves whose dispatch was lost, cap exhausted → permanently
  --    fail. Deliberately NOT gated on the master still being active — an
  --    orphaned slave under an already-terminal master must still get
  --    cleaned out of 'pending' once stale.
  UPDATE app.integration_sync_jobs j
  SET status       = 'failed',
      attempt_count = COALESCE(j.attempt_count, 0) + 1,
      error_log    = jsonb_build_object(
        'message',   'reaped: exceeded revival cap — pending slave dispatch repeatedly lost or orphaned',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE j.status = 'pending'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.master_job_id IS NOT NULL
    AND j.updated_at < now() - v_dispatch_lost_after
    AND (j.next_retry_eligible_at IS NULL OR j.next_retry_eligible_at < now())
    AND COALESCE(j.attempt_count, 0) >= v_max_attempts;

  -- 5. Master halt: any active master with at least one permanently-failed
  --    slave (matched by message, not by how recently it happened — a
  --    permanent failure means "never auto-retry", so the master should
  --    halt regardless of when that conclusion was reached, including
  --    across a migration deploy landing in between).
  UPDATE app.integration_sync_jobs m
  SET status       = 'failed',
      progress     = jsonb_set(
        COALESCE(m.progress, '{}'::jsonb),
        '{meta,run_halted}',
        'true'::jsonb,
        true
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE m.phase = 'sync_run'
    AND m.status IN ('running', 'paused')
    AND EXISTS (
      SELECT 1
      FROM app.integration_sync_jobs s
      WHERE s.master_job_id = m.id
        AND s.status = 'failed'
        AND (
          s.error_log->>'message' LIKE 'reaped: exceeded revival cap%'
          OR s.error_log->>'message' LIKE 'reaped: pending slave never dispatched%'
        )
    );

  -- 6. Idle disarm: no sync_run master active, and none went terminal in the
  --    last 2 minutes (grace period for trailing slave cleanup) → unschedule
  --    both crons. integrations-sync's trigger above re-arms them the moment
  --    a new run starts — no manual re-scheduling needed.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.integration_sync_jobs
    WHERE phase = 'sync_run'
      AND (
        status IN ('pending', 'running', 'paused')
        OR updated_at > now() - interval '2 minutes'
      )
  ) THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-coordinator-tick';
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-reaper-backstop';
  END IF;
END;
$function$;

-- ── Cheap, low-frequency standing safety net: if the disarm step itself
--    ever fails to fire (e.g. a crash mid-run leaves things stuck armed with
--    no active job), this catches it without needing either hot-path cron
--    to be running. Runs the same idle check as step 6 above. ────────────
CREATE OR REPLACE FUNCTION app.sync_cron_idle_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.integration_sync_jobs
    WHERE phase = 'sync_run'
      AND (
        status IN ('pending', 'running', 'paused')
        OR updated_at > now() - interval '2 minutes'
      )
  ) THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-coordinator-tick';
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-reaper-backstop';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.sync_cron_idle_sweep() FROM PUBLIC;
GRANT ALL ON FUNCTION app.sync_cron_idle_sweep() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-cron-idle-sweep') THEN
      PERFORM cron.schedule('sync-cron-idle-sweep', '*/15 * * * *', 'SELECT app.sync_cron_idle_sweep()');
    END IF;

    -- Both hot-path crons start disarmed — the trigger above re-arms them
    -- the moment a sync_run job goes pending/running.
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-coordinator-tick';
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-reaper-backstop';
  END IF;
END;
$$;
