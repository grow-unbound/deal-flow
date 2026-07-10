-- Phase 3 of sync orchestration redesign: reaper becomes a bounded backstop.
--
-- Two problems with the reaper this replaces:
--
-- 1. It was only ever invoked once/day (from run_zoho_orchestrator_cron,
--    scheduled '30 23 * * *') even though its own v_stale_after was 10
--    minutes — up to ~24h detection lag for a genuinely stuck job. This
--    migration gives it its own tight-ish cron schedule, independent of the
--    daily kickoff.
--
-- 2. Its "revive" step force-paused any running slave stale >10min with a
--    synthetic next_cursor, unconditionally, with no cap — this is the exact
--    mechanism that caused the original incident: a tight-cadence version of
--    this reaper kept blindly re-resubmitting a failing job with no
--    stop-clause, burning the tenant's entire Zoho API rate limit. This
--    migration applies the SAME bounded revival policy the sync-coordinator
--    uses (attempt_count cap of 3, exponential backoff 30s/90s/270s — see
--    decideRevival in src/lib/integrations/sync-orchestration.ts) so the
--    reaper can never blindly retry forever again, whether or not the
--    coordinator has been flipped live yet (see SYNC_COORDINATOR_LIVE in
--    supabase/functions/sync-coordinator/index.ts — while it's still in
--    shadow mode, this reaper is the ONLY thing acting on staleness, so it
--    must carry the same safety properties).
--
-- Thresholds match the coordinator's own heartbeat-anchored constants
-- (STALE_RUNNING_LEASE_MS = 5min, dispatch-lost = 2min) rather than the old
-- flat 10-minute constant used for both purposes.

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
  -- 1. Running slaves stale beyond lease, still under the revival cap →
  --    bounded revive: reset to pending with exponential backoff, same
  --    policy as the coordinator's own reviveOrFailSlave.
  UPDATE app.integration_sync_jobs j
  SET status                 = 'pending',
      attempt_count           = COALESCE(j.attempt_count, 0) + 1,
      next_retry_eligible_at  = now() + make_interval(secs => v_backoff_base_secs * power(v_backoff_multiplier, COALESCE(j.attempt_count, 0))),
      updated_at              = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_running_stale_after
    AND COALESCE(j.attempt_count, 0) < v_max_attempts;

  -- 2. Running slaves stale beyond lease, revival cap already exhausted →
  --    permanently fail (mirrors reviveOrFailSlave's 'permanently_fail' path).
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
    AND COALESCE(j.attempt_count, 0) >= v_max_attempts;

  -- 3. Pending slaves whose dispatch was lost (selfChain/coordinator fired
  --    but the HTTP call never landed), still under cap → bounded revive.
  --    Left 'pending' (not re-dispatched here directly) so the next
  --    coordinator tick or self-chain retry picks it up once
  --    next_retry_eligible_at has passed.
  UPDATE app.integration_sync_jobs j
  SET attempt_count           = COALESCE(j.attempt_count, 0) + 1,
      next_retry_eligible_at  = now() + make_interval(secs => v_backoff_base_secs * power(v_backoff_multiplier, COALESCE(j.attempt_count, 0))),
      updated_at              = now()
  WHERE j.status = 'pending'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.master_job_id IS NOT NULL
    AND j.updated_at < now() - v_dispatch_lost_after
    AND (j.next_retry_eligible_at IS NULL OR j.next_retry_eligible_at < now())
    AND COALESCE(j.attempt_count, 0) < v_max_attempts;

  -- 4. Pending slaves whose dispatch was lost, cap exhausted → permanently fail.
  UPDATE app.integration_sync_jobs j
  SET status       = 'failed',
      attempt_count = COALESCE(j.attempt_count, 0) + 1,
      error_log    = jsonb_build_object(
        'message',   'reaped: exceeded revival cap — pending slave dispatch repeatedly lost',
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
  --    self-healing event and must not fail the whole run.
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
        AND s.updated_at >= now() - interval '1 minute'
        AND (
          s.error_log->>'message' LIKE 'reaped: exceeded revival cap%'
        )
    );
END;
$$;

-- Decouple from the once-daily kickoff — its own tight-ish backstop cadence.
-- This is a bounded, capped operation (unlike the pre-incident 15-30s reaper
-- with no stop-clause), so a 2-minute cadence is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-reaper-backstop') THEN
      -- pg_cron's sub-minute shorthand only accepts 'N seconds' — anything
      -- minute-granularity or coarser needs standard 5-field cron syntax.
      PERFORM cron.schedule('sync-reaper-backstop', '*/2 * * * *', 'SELECT app.reap_stale_sync_jobs()');
    END IF;
  END IF;
END;
$$;
