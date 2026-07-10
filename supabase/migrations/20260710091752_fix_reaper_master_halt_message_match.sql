-- Fix: step 4 (pending slave, revival cap exhausted -> permanently fail)
-- wrote a message that didn't match step 5's LIKE pattern for halting the
-- master, so a master would sit 'running' forever even after one of its
-- slaves was correctly marked permanently failed. Step 2 (running slave,
-- cap exhausted) already used the right prefix; step 4 gets the same one,
-- and step 5's match is widened defensively to catch either.

CREATE OR REPLACE FUNCTION app.reap_stale_sync_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_running_stale_after  interval := interval '5 minutes';
  v_dispatch_lost_after  interval := interval '2 minutes';
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
  --    cleaned out of 'pending' once stale. Message prefix matches step 2's
  --    so step 5 below halts the master either way.
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

  -- 5. Master halt: only once a slave has been PERMANENTLY failed by this
  --    reaper (steps 2/4) — a bounded revive (steps 1/3) is a normal,
  --    self-healing event and must not fail the whole run. Widened LIKE
  --    to match both step 2/4's current prefix and defend against any
  --    already-failed rows written by the prior (mismatched) version of
  --    this function.
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
        AND s.updated_at >= now() - interval '3 minutes'
        AND (
          s.error_log->>'message' LIKE 'reaped: exceeded revival cap%'
          OR s.error_log->>'message' LIKE 'reaped: pending slave never dispatched%'
        )
    );
END;
$$;
