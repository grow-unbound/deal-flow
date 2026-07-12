-- Prepone the daily Zoho sync from 30 23 * * * UTC (05:00 IST) to
-- 30 22 * * * UTC (04:00 IST) — one hour further from business-hours traffic.
--
-- run_zoho_orchestrator_cron's own body gates the actual dispatch on
-- `v_hour = 5 AND v_min < 5` (IST) — moving only the pg_cron schedule without
-- updating this internal gate would make the job fire at 04:00 IST and no-op
-- (hour check fails), silently skipping the daily sync entirely. Both must
-- move together.
CREATE OR REPLACE FUNCTION app.run_zoho_orchestrator_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_base_url text := app.get_functions_base_url();
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
  v_hour     int  := EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata');
  v_min      int  := EXTRACT(MINUTE FROM now() AT TIME ZONE 'Asia/Kolkata');
  v_since    date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
BEGIN
  PERFORM app.reap_stale_sync_jobs();

  -- Daily incremental sync at 04:00-04:04 IST for tenants without an active
  -- master run, and not suspended by the circuit breaker.
  IF v_hour = 4 AND v_min < 5 THEN
    PERFORM net.http_post(
      url := v_base_url || '/integrations-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-integrations-dispatch-secret', COALESCE(v_secret, '')
      ),
      body := jsonb_build_object(
        'tenant_integration_id', ti.id,
        'job_type', 'incremental',
        'run_kind', 'daily_incremental',
        'since', to_char(v_since, 'YYYY-MM-DD')
      )
    )
    FROM app.tenant_integrations ti
    WHERE ti.deleted_at IS NULL
      AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
      AND ti.sync_suspended = false
      AND NOT EXISTS (
        SELECT 1 FROM app.integration_sync_jobs mj
        WHERE mj.tenant_integration_id = ti.id
          AND mj.phase = 'sync_run'
          AND mj.status IN ('pending', 'running', 'paused')
          AND COALESCE((mj.progress->'meta'->>'run_cancelled')::boolean, false) = false
          AND COALESCE((mj.progress->'meta'->>'run_halted')::boolean, false) = false
      );
  END IF;
END;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.alter_job(jobid, schedule := '30 22 * * *')
    FROM cron.job
    WHERE jobname = 'zoho-sync-daily';
  END IF;
END;
$$;
