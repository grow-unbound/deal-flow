-- Resume-from-cursor cron: replaces the 7 staggered phase-specific crons.
--
-- The orchestrator (integrations-sync) now loops internally per-phase with a 130s budget.
-- When it runs out of budget mid-phase, it sets integration status='connected' (was 'paused')
-- and returns a resume payload with the next cursor.
--
-- This single cron fires every 5 minutes and:
--   1. Finds any tenant_integrations that have a paused sync job with a cursor
--   2. Re-invokes integrations-sync with the resume payload to continue from the cursor
--   3. Also handles the nightly full sync for tenants with no active job

-- Remove the 7 staggered phase-specific cron jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $dyn$
      DO $inner$
      BEGIN
        PERFORM cron.unschedule(jobname)
        FROM cron.job
        WHERE jobname IN (
          'sync-locations-daily', 'sync-products-daily', 'sync-pricelists-daily',
          'sync-customers-daily', 'sync-estimates-daily', 'sync-orders-daily',
          'sync-invoices-daily'
        );
      END;
      $inner$
    $dyn$;
  END IF;
END;
$$;

-- Function that resumes any paused syncs and triggers nightly syncs
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

-- Register single orchestrator cron (every 5 minutes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping cron schedule';
    RETURN;
  END IF;

  EXECUTE $dyn$
    DO $inner$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-orchestrator') THEN
        PERFORM cron.schedule('zoho-sync-orchestrator', '*/5 * * * *',
          'SELECT app.run_zoho_orchestrator_cron()');
      END IF;
    END;
    $inner$
  $dyn$;
END;
$$;
