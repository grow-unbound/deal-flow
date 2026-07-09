-- Real usage pattern: one large initial_sync at connect time (needs frequent
-- resume — many pages, many invocations), then tiny daily incremental syncs
-- (1-2 pages, rarely pause), with webhooks covering everything else. Running
-- the orchestrator cron forever every 30s is unnecessary once things go quiet.
--
-- Make the cron self-terminating: at the end of each tick, if there's no
-- active job (running/paused/queued/pending) AND no job created in the last
-- 24 hours for any Zoho tenant, unschedule itself. And make integrations-sync
-- re-arm it (idempotent) at the start of every run, so it comes back
-- automatically the moment a new sync (manual click or initial connect)
-- kicks off — no manual re-scheduling needed.

CREATE OR REPLACE FUNCTION app.ensure_zoho_sync_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-orchestrator') THEN
    PERFORM cron.schedule('zoho-sync-orchestrator', '30 seconds', 'SELECT app.run_zoho_orchestrator_cron()');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.ensure_zoho_sync_cron_scheduled() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_zoho_sync_cron_scheduled() TO service_role;

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
  PERFORM app.reap_stale_sync_jobs();

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

  -- Self-terminate when idle: no active job anywhere, and nothing created in
  -- the last 24h. integrations-sync re-arms this the moment a new sync starts.
  IF NOT EXISTS (
    SELECT 1 FROM app.integration_sync_jobs
    WHERE status IN ('running', 'paused', 'queued', 'pending')
       OR created_at > now() - interval '24 hours'
  ) THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'zoho-sync-orchestrator';
  END IF;
END;
$$;
