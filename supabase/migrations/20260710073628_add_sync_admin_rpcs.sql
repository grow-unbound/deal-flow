-- Phase 3 of sync orchestration redesign: human-intervention RPCs.
--
-- app.retry_sync_phase — the only way to restart a phase that was marked
-- app.integration_sync_jobs.progress.meta.permanently_failed after exhausting
-- its bounded revival attempts (see reviveOrFailSlave / decideRevival). Never
-- auto-invoked; resets attempt_count so the coordinator/reaper's bounded
-- revival policy applies fresh, same as a first attempt.
--
-- app.acknowledge_sync_suspension — the only way to clear
-- tenant_integrations.sync_suspended once the circuit breaker trips after
-- CIRCUIT_BREAKER_FAILURE_THRESHOLD consecutive failed runs. Deliberately not
-- auto-cleared on the next manual sync attempt, so a flapping integration
-- doesn't quietly re-enable its own automatic daily syncs.
--
-- Both gated by the existing app._tenant_integrations_assert_seller_admin
-- helper, matching the convention used elsewhere for tenant-integration writes.

CREATE OR REPLACE FUNCTION "app"."retry_sync_phase"("p_job_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_job app.integration_sync_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job
  FROM app.integration_sync_jobs
  WHERE id = p_job_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sync_job_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.phase = 'sync_run' THEN
    RAISE EXCEPTION 'retry_sync_phase only applies to phase slave jobs, not the master run' USING ERRCODE = '22023';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_job.tenant_id, p_actor_user_id);

  UPDATE app.integration_sync_jobs
  SET status                 = 'pending',
      attempt_count           = 0,
      next_retry_eligible_at  = NULL,
      error_log               = NULL,
      progress                = jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,permanently_failed}', 'false'::jsonb, true),
      updated_at              = now(),
      updated_by              = p_actor_user_id
  WHERE id = p_job_id;

  RETURN jsonb_build_object('ok', true, 'job_id', p_job_id, 'phase', v_job.phase);
END;
$$;

ALTER FUNCTION "app"."retry_sync_phase"("p_job_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "app"."retry_sync_phase"("p_job_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app"."retry_sync_phase"("p_job_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "app"."acknowledge_sync_suspension"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_integration app.tenant_integrations%ROWTYPE;
BEGIN
  SELECT * INTO v_integration
  FROM app.tenant_integrations
  WHERE id = p_tenant_integration_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_integration_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_integration.tenant_id, p_actor_user_id);

  UPDATE app.tenant_integrations
  SET sync_suspended          = false,
      sync_suspended_reason   = NULL,
      sync_suspended_at       = NULL,
      consecutive_run_failures = 0,
      updated_at              = now(),
      updated_by              = p_actor_user_id
  WHERE id = p_tenant_integration_id;

  RETURN jsonb_build_object('ok', true, 'tenant_integration_id', p_tenant_integration_id);
END;
$$;

ALTER FUNCTION "app"."acknowledge_sync_suspension"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "app"."acknowledge_sync_suspension"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app"."acknowledge_sync_suspension"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated", "service_role";
