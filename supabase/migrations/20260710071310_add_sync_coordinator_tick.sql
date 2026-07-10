-- Phase 2 of sync orchestration redesign: coordinator tick, SHADOW MODE.
--
-- app.tick_sync_coordinator() claims idle active runs (FOR UPDATE SKIP
-- LOCKED + coordinator_lease_until — needed because net.http_post is async,
-- so the row lock releases at commit, well before the sync-coordinator
-- invocation actually finishes; the lease is the real mutual-exclusion
-- guard) and dispatches each to the new sync-coordinator edge function,
-- which currently only DECIDES and records progress.meta.shadow_decision —
-- it does not yet act. This runs alongside the existing self-chain path
-- with zero behavior change; it exists so shadow-mode decisions can be
-- compared against real self-chain behavior before integrations-sync is
-- flipped to stop self-chaining (a later migration/deploy).
--
-- Uses the same pg_net-from-plpgsql pattern already proven in
-- run_zoho_orchestrator_cron — no new extension, no new infra.

CREATE OR REPLACE FUNCTION "app"."tick_sync_coordinator"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_base_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1';
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
  v_lease    interval := interval '30 seconds';
  v_run      record;
BEGIN
  FOR v_run IN
    SELECT id
    FROM app.integration_sync_jobs
    WHERE phase = 'sync_run'
      AND status IN ('running', 'paused')
      AND deleted_at IS NULL
      AND (coordinator_lease_until IS NULL OR coordinator_lease_until < now())
    ORDER BY updated_at ASC
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE app.integration_sync_jobs
    SET coordinator_lease_until = now() + v_lease
    WHERE id = v_run.id;

    PERFORM net.http_post(
      url := v_base_url || '/sync-coordinator',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-integrations-dispatch-secret', COALESCE(v_secret, '')
      ),
      body := jsonb_build_object('master_job_id', v_run.id)
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."tick_sync_coordinator"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "app"."tick_sync_coordinator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."tick_sync_coordinator"() TO "service_role";

CREATE OR REPLACE FUNCTION "app"."ensure_sync_coordinator_cron_scheduled"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-coordinator-tick') THEN
    PERFORM cron.schedule('sync-coordinator-tick', '15 seconds', 'SELECT app.tick_sync_coordinator()');
  END IF;
END;
$$;

ALTER FUNCTION "app"."ensure_sync_coordinator_cron_scheduled"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "app"."ensure_sync_coordinator_cron_scheduled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."ensure_sync_coordinator_cron_scheduled"() TO "service_role";

SELECT app.ensure_sync_coordinator_cron_scheduled();
