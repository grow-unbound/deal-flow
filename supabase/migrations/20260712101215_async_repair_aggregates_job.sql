-- Async Repair Aggregates — ephemeral pg_cron pattern
--
-- Mirrors the sync coordinator pattern from
-- 20260712093428_scope_sync_coordinator_crons_to_job_lifetime.sql:
--   • API creates a job row (phase='repair_aggregates', status='pending')
--   • DB trigger arms 'repair-jobs-tick' (30s) the moment the row is inserted
--   • tick_repair_jobs() procedure picks it up, runs rebuild_metrics_for_tenant_range,
--     then self-disarms the cron on completion/failure
--   • sync_cron_idle_sweep (15-min safety net) reaps orphaned repair jobs and
--     disarms the repair cron if it was left armed with nothing to do
--
-- The repair cron never runs outside of an active repair — no standing 24/7 cost.

-- ── 1. Idempotent arm helper ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.ensure_repair_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'repair-jobs-tick') THEN
    PERFORM cron.schedule('repair-jobs-tick', '30 seconds', 'CALL app.tick_repair_jobs()');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.ensure_repair_cron_scheduled() FROM PUBLIC;
GRANT ALL ON FUNCTION app.ensure_repair_cron_scheduled() TO service_role;

-- ── 2. Extend arm trigger to also arm the repair cron ───────────────────────
--
-- The existing trigger only fired when phase='sync_run' goes active.
-- Widen the trigger function to branch on phase, and update the WHEN clause
-- to also fire when a repair job is inserted as 'pending'.
CREATE OR REPLACE FUNCTION app.arm_sync_coordinator_crons()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
  IF NEW.phase = 'sync_run' THEN
    PERFORM app.ensure_sync_coordinator_cron_scheduled();
    PERFORM app.ensure_reaper_cron_scheduled();
  ELSIF NEW.phase = 'repair_aggregates' THEN
    PERFORM app.ensure_repair_cron_scheduled();
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.arm_sync_coordinator_crons() FROM PUBLIC;
GRANT ALL ON FUNCTION app.arm_sync_coordinator_crons() TO service_role;

DROP TRIGGER IF EXISTS integration_sync_jobs_arm_coordinator_crons ON app.integration_sync_jobs;

CREATE TRIGGER integration_sync_jobs_arm_coordinator_crons
AFTER INSERT OR UPDATE OF status ON app.integration_sync_jobs
FOR EACH ROW
WHEN (
  (NEW.phase = 'sync_run'          AND NEW.status IN ('pending', 'running'))
  OR (NEW.phase = 'repair_aggregates' AND NEW.status = 'pending')
)
EXECUTE FUNCTION app.arm_sync_coordinator_crons();

-- ── 3. Core repair worker procedure ─────────────────────────────────────────
--
-- Called by pg_cron every 30s while armed.  Uses PROCEDURE (not FUNCTION)
-- so it can issue explicit COMMITs between state transitions — each commit
-- fires a Realtime notification and releases the row lock so the next tick
-- sees updated status without waiting for this call to finish.
--
-- rebuild_metrics_for_tenant_range has SET statement_timeout TO '10min' in
-- its SECURITY DEFINER header and rejects ranges over 90 days, so a single
-- repair call is bounded regardless of what pg_cron's session inherits.
CREATE OR REPLACE PROCEDURE app.tick_repair_jobs()
LANGUAGE plpgsql
AS $$
DECLARE
  v_job  record;
  v_p    jsonb;
  v_res  jsonb;
BEGIN
  -- Idempotent guard: skip if one is already executing
  IF EXISTS (
    SELECT 1 FROM app.integration_sync_jobs
    WHERE phase = 'repair_aggregates'
      AND status = 'running'
      AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Claim one pending repair job (SKIP LOCKED prevents concurrent double-pick)
  SELECT * INTO v_job
  FROM app.integration_sync_jobs
  WHERE phase = 'repair_aggregates'
    AND status = 'pending'
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Mark running, commit immediately → Realtime fires, frontend sees 'running'
  UPDATE app.integration_sync_jobs
    SET status     = 'running',
        started_at = now(),
        updated_at = now()
    WHERE id = v_job.id;
  COMMIT;

  v_p := v_job.progress -> 'params';

  BEGIN
    SELECT app.rebuild_metrics_for_tenant_range(
      v_job.tenant_id,
      (v_p ->> 'start_day')::date,
      (v_p ->> 'end_day')::date,
      COALESCE((v_p ->> 'include_snapshots')::boolean, true),
      COALESCE((v_p ->> 'include_kpis')::boolean, true)
    ) INTO v_res;

    -- Self-disarm before terminal commit: no more work for this cron
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'repair-jobs-tick';

    UPDATE app.integration_sync_jobs
      SET status       = 'completed',
          completed_at = now(),
          updated_at   = now(),
          summary      = v_res
      WHERE id = v_job.id;
    COMMIT;  -- Realtime fires: 'completed'

  EXCEPTION WHEN OTHERS THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'repair-jobs-tick';

    UPDATE app.integration_sync_jobs
      SET status       = 'failed',
          completed_at = now(),
          updated_at   = now(),
          error_log    = jsonb_build_object(
            'message',  SQLERRM,
            'sqlstate', SQLSTATE,
            'timestamp', now()
          )
      WHERE id = v_job.id;
    COMMIT;  -- Realtime fires: 'failed'
  END;
END;
$$;

REVOKE ALL ON PROCEDURE app.tick_repair_jobs() FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE app.tick_repair_jobs() TO postgres;

-- ── 4. Extend sync_cron_idle_sweep with repair job handling ─────────────────
--
-- The 15-min sweep is the safety net for any state the self-disarm in
-- tick_repair_jobs missed (e.g. a Postgres crash mid-run).
-- Two additions:
--   a) Reap repair jobs stuck in 'running' for >30 min (procedure died mid-run)
--   b) Disarm 'repair-jobs-tick' if no active or recently-terminal repair exists
CREATE OR REPLACE FUNCTION app.sync_cron_idle_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
  -- Existing sync_run idle disarm (unchanged)
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

  -- Reap repair jobs stuck in running (procedure died without committing terminal state)
  UPDATE app.integration_sync_jobs
    SET status       = 'failed',
        completed_at = now(),
        updated_at   = now(),
        error_log    = jsonb_build_object(
          'message',   'reaped: repair job stuck in running state for >30 minutes',
          'timestamp', now()
        )
    WHERE phase = 'repair_aggregates'
      AND status = 'running'
      AND updated_at < now() - interval '30 minutes';

  -- Disarm repair cron if no active or recently-terminal repair job
  IF NOT EXISTS (
    SELECT 1 FROM app.integration_sync_jobs
    WHERE phase = 'repair_aggregates'
      AND (
        status IN ('pending', 'running')
        OR updated_at > now() - interval '2 minutes'
      )
  ) THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'repair-jobs-tick';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.sync_cron_idle_sweep() FROM PUBLIC;
GRANT ALL ON FUNCTION app.sync_cron_idle_sweep() TO service_role;
