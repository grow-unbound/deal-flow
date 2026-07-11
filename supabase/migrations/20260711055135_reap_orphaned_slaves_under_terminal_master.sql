-- Adds rule 6 to app.reap_stale_sync_jobs(): a slave still in an active
-- status (pending/queued/running/paused) whose master has already reached
-- a terminal state is permanently orphaned. tick_sync_coordinator() only
-- polls masters with status IN ('running','paused') and will never look at
-- this master again once it halts/completes/gets cancelled — so nothing
-- else will ever advance or clean up this slave. Without this rule such a
-- slave sits abandoned indefinitely (observed: an hour, until a manual
-- cancel happened to catch it) instead of reaching a bounded terminal
-- state. Runs on the same 1-minute sync-reaper-backstop cron as every
-- other rule, and is placed after rule 5 (master halt) so a master halted
-- earlier in the SAME invocation has its orphans cleaned up in the same
-- pass.
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

  -- 6. Any slave still active whose master has already reached a terminal
  --    state (failed/cancelled/completed, or simply no longer active) is
  --    permanently orphaned — the coordinator only polls masters with
  --    status IN ('running','paused') and will never look at it again.
  --    Give it a clean terminal state immediately instead of leaving it to
  --    rot until a manual cancel stumbles onto it. Placed after rule 5 so
  --    a master halted earlier in this same invocation is covered too.
  UPDATE app.integration_sync_jobs j
  SET status       = 'cancelled',
      error_log    = jsonb_build_object(
        'message',   'cancelled: master run reached a terminal state before this phase finished',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE j.status IN ('pending', 'queued', 'running', 'paused')
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.master_job_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.integration_sync_jobs m
      WHERE m.id = j.master_job_id AND m.phase = 'sync_run' AND m.status IN ('pending', 'running', 'paused')
    );
END;
$function$
