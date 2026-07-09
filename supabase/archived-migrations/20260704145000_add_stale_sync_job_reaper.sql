-- Stale sync job reaper.
--
-- Root cause of the "sync stuck forever" bug: when a sync-{phase} edge function
-- crashes or gets platform-killed mid-invocation (after persisting a page, before
-- writing its next status), the integration_sync_jobs row is abandoned at
-- status='running' and tenant_integrations stays at status='syncing'. Neither
-- the app-level catch blocks (which only handle exceptions the function itself
-- catches, not platform kills) nor the resume cron (which only looks at
-- status='paused') can ever recover it — the job is wedged permanently, and the
-- 'no active job' guard on the nightly full-sync also refuses to re-trigger for
-- that tenant.
--
-- Fix: a reaper that finds jobs stuck at status='running' with no progress
-- update in the last 10 minutes (safely past the 130s orchestrator + 100s
-- per-phase budgets) and either:
--   - flips them to 'paused' with a synthetic next_cursor derived from
--     pages_fetched, so the existing resume-cron path picks them back up, or
--   - marks them 'failed' if no page was ever persisted (nothing to resume from)
-- and resets the owning tenant_integrations row back to 'connected' so it isn't
-- permanently excluded from future syncs.
CREATE OR REPLACE FUNCTION app.reap_stale_sync_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_stale_after interval := interval '10 minutes';
  v_default_per_page int := 200;
BEGIN
  -- Jobs with progress (at least one page persisted): resume from next page.
  UPDATE app.integration_sync_jobs j
  SET status = 'paused',
      progress = j.progress || jsonb_build_object(
        'next_cursor', jsonb_build_object(
          'phase', j.phase,
          'entity_type', j.phase,
          'page', COALESCE((j.progress->>'pages_fetched')::int, 0) + 1,
          'per_page', v_default_per_page,
          'has_more', true,
          'since', j.since_date
        )
      ),
      updated_at = now()
  WHERE j.status = 'running'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) > 0;

  -- Jobs with no progress at all: nothing to resume from, mark failed.
  UPDATE app.integration_sync_jobs j
  SET status = 'failed',
      error_log = jsonb_build_object(
        'message', 'reaped: job stalled in running state with no progress for over 10 minutes (likely a platform-killed invocation)',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at = now()
  WHERE j.status = 'running'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) = 0;

  -- Any tenant_integration left at status='syncing' with no job still actually
  -- running/queued is stranded — reset it so it's eligible for sync again.
  UPDATE app.tenant_integrations ti
  SET status = 'connected', updated_at = now()
  WHERE ti.status = 'syncing'
    AND ti.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.integration_sync_jobs j
      WHERE j.tenant_integration_id = ti.id
        AND j.status IN ('running', 'queued')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION app.reap_stale_sync_jobs() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reap_stale_sync_jobs() TO service_role;

-- Run the reaper at the top of every orchestrator cron tick, before the
-- paused-job resume pass, so a job reaped this tick gets picked up in the
-- same tick instead of waiting another 5 minutes.
CREATE OR REPLACE FUNCTION app.run_zoho_orchestrator_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_base_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1';
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
  v_hour     int  := EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata');
  v_min      int  := EXTRACT(MINUTE FROM now() AT TIME ZONE 'Asia/Kolkata');
BEGIN
  -- 0. Reap any jobs stuck at status='running' from a crashed/killed invocation.
  PERFORM app.reap_stale_sync_jobs();

  -- 1. Resume any paused syncs (has a job with status='paused' + next_cursor).
  -- Guard on ti.status='connected': skip tenants already syncing to avoid 409 noise.
  PERFORM net.http_post(
    url := v_base_url || '/integrations-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-integrations-dispatch-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'tenant_integration_id', ti.id,
      'job_type', 'incremental',
      'phase', j.phase,
      -- progress->'next_cursor' is a jsonb sub-object; use -> not ->> to stay in jsonb
      'page_from', (j.progress->'next_cursor'->>'page')::int
    )
  )
  FROM app.tenant_integrations ti
  JOIN LATERAL (
    SELECT phase, progress
    FROM app.integration_sync_jobs
    WHERE tenant_integration_id = ti.id
      AND status = 'paused'
      AND progress->'next_cursor' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  ) j ON true
  WHERE ti.deleted_at IS NULL
    AND ti.status = 'connected'
    AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory');

  -- 2. Nightly full sync at 05:00 IST (23:30 UTC) for connected tenants with no active job
  IF v_hour = 5 AND v_min < 5 THEN
    PERFORM net.http_post(
      url := v_base_url || '/integrations-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-integrations-dispatch-secret', COALESCE(v_secret, '')
      ),
      body := jsonb_build_object(
        'tenant_integration_id', ti.id,
        'job_type', 'incremental'
      )
    )
    FROM app.tenant_integrations ti
    WHERE ti.deleted_at IS NULL
      AND ti.status = 'connected'
      AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
      AND NOT EXISTS (
        SELECT 1 FROM app.integration_sync_jobs j2
        WHERE j2.tenant_integration_id = ti.id
          AND j2.status IN ('running', 'queued', 'paused')
      );
  END IF;
END;
$$;
