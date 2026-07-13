-- Prepone the daily Zoho sync to 00:00 IST (30 18 * * * UTC) — anchors the
-- whole daily cron chain to midnight-IST hours, 30min apart:
--   00:00 IST  zoho-sync-daily              (30 18 UTC)
--   00:30 IST  buyer-metric-snapshot-freshness (0 19 UTC)
--   01:00 IST  reco-popularity-daily         (30 19 UTC)
--   01:30 IST  cron-job-run-details-purge    (0 20 UTC)
--   02:00 IST  reco-buyer-weekly (Mon)        (30 20 UTC, day-of-week 0=Sun)
--   02:30 IST  reco-assoc-category-fortnightly (0 21 UTC, day 1,15)
--
-- run_zoho_orchestrator_cron's own body gates the actual dispatch on IST
-- hour/minute — moving only the pg_cron schedule without updating this
-- internal gate would make the job fire at 00:00 IST and no-op (hour check
-- fails), silently skipping the daily sync entirely. Both must move together.
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

  -- Daily incremental sync at 00:00-00:04 IST for tenants without an active
  -- master run, and not suspended by the circuit breaker.
  IF v_hour = 0 AND v_min < 5 THEN
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
    PERFORM cron.alter_job(jobid, schedule := '30 18 * * *')
    FROM cron.job
    WHERE jobname = 'zoho-sync-daily';
  END IF;
END;
$$;
