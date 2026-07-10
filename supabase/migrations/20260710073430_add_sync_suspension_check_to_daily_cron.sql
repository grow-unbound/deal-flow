-- Phase 3 of sync orchestration redesign: circuit breaker enforcement.
--
-- After CIRCUIT_BREAKER_FAILURE_THRESHOLD (3) consecutive fully-failed runs
-- for a tenant integration, app.tenant_integrations.sync_suspended gets set
-- true by the coordinator (updateCircuitBreakerState in
-- sync-coordinator-actions.ts). This migration makes the daily automatic
-- kickoff actually respect that flag — manual syncs from Settings are
-- unaffected (they don't go through this cron function at all), so a
-- suspended tenant can still be manually re-synced; only the automatic
-- cron-triggered path stops until a human runs app.acknowledge_sync_suspension.

CREATE OR REPLACE FUNCTION "app"."run_zoho_orchestrator_cron"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_base_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1';
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
  v_hour     int  := EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata');
  v_min      int  := EXTRACT(MINUTE FROM now() AT TIME ZONE 'Asia/Kolkata');
  v_since    date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
BEGIN
  PERFORM app.reap_stale_sync_jobs();

  -- Daily incremental sync at 05:00–05:04 IST for tenants without an active
  -- master run, and not suspended by the circuit breaker.
  IF v_hour = 5 AND v_min < 5 THEN
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
$$;

ALTER FUNCTION "app"."run_zoho_orchestrator_cron"() OWNER TO "postgres";
