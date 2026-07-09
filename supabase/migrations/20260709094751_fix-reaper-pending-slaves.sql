-- Fix reaper to rescue pending slaves whose continuation dispatch was lost.
--
-- Before this fix: reap_stale_sync_jobs() only handled 'running' slaves.
-- A pending slave created by selfChain (continuation) that never started
-- (dispatchContinuation timed out / network error) would stay pending forever.
-- The master job would stay paused indefinitely with no recovery path.
--
-- After this fix:
--   1. Stale pending slaves → failed (with a clear reaper message).
--   2. Master jobs with reaped pending slaves → failed (same run, via master_job_id).
--      This matches the existing master-halt for stale running slaves.

CREATE OR REPLACE FUNCTION app.reap_stale_sync_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_stale_after      interval := interval '10 minutes';
  v_default_per_page int      := 200;
BEGIN
  -- 1. Slave rescue: running slaves that have made progress → pause them
  UPDATE app.integration_sync_jobs j
  SET status    = 'paused',
      progress  = j.progress || jsonb_build_object(
        'next_cursor', jsonb_build_object(
          'phase',       j.phase,
          'entity_type', j.phase,
          'page',        COALESCE((j.progress->>'pages_fetched')::int, 0) + 1,
          'per_page',    v_default_per_page,
          'has_more',    true,
          'since',       j.since_date
        )
      ),
      updated_at = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) > 0;

  -- 2. Slave rescue: running slaves with no progress → fail them
  UPDATE app.integration_sync_jobs j
  SET status       = 'failed',
      error_log    = jsonb_build_object(
        'message',   'reaped: job stalled in running state with no progress for over 10 minutes',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) = 0;

  -- 3. Slave rescue: pending slaves whose continuation dispatch was lost → fail them.
  --    selfChain creates a pending slave then fires dispatchContinuation with a 5s abort.
  --    If the dispatch fails (network error / cold-start) the slave stays pending forever.
  --    Fail these so step 4 can halt the master cleanly.
  UPDATE app.integration_sync_jobs j
  SET status       = 'failed',
      error_log    = jsonb_build_object(
        'message',   'reaped: pending slave never dispatched — continuation dispatch timed-out or lost',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE j.status = 'pending'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.master_job_id IS NOT NULL
    AND j.updated_at < now() - v_stale_after;

  -- 4. Master halt: fail active masters that have stale running slaves OR
  --    slaves that were just reaped from pending in step 3.
  --    Uses master_job_id real column (JSONB path was broken before migration
  --    add_master_job_id_to_sync_jobs).
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
    AND m.updated_at < now() - v_stale_after
    AND EXISTS (
      SELECT 1
      FROM app.integration_sync_jobs s
      WHERE s.master_job_id = m.id
        AND (
          -- stale running slave (original condition)
          (s.status = 'running' AND s.updated_at < now() - v_stale_after)
          OR
          -- slave just reaped from pending in step 3
          (s.status = 'failed'
           AND s.error_log->>'message' LIKE 'reaped: pending slave never dispatched%')
        )
    );
END;
$$;
