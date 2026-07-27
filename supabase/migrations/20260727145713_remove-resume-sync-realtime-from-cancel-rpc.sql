-- app.resume_sync_realtime() was dropped in 20260727044613 (realtime publication
-- consolidate). cancel_tenant_integration_sync_job still called it on manual cancel.
CREATE OR REPLACE FUNCTION app.cancel_tenant_integration_sync_job(p_tenant_integration_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_tenant_integration app.tenant_integrations%rowtype;
  v_now timestamptz := now();
  v_now_iso text := to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_cancelled_count int;
  v_master_id uuid;
  v_sync_run_id text;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF NOT found THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  SELECT mj.id, COALESCE(mj.progress->>'sync_run_id', mj.id::text)
  INTO v_master_id, v_sync_run_id
  FROM app.integration_sync_jobs mj
  WHERE mj.tenant_integration_id = p_tenant_integration_id
    AND mj.deleted_at IS NULL
    AND mj.phase = 'sync_run'
    AND mj.status IN ('pending', 'running', 'paused')
  ORDER BY mj.created_at DESC
  LIMIT 1;

  IF v_master_id IS NULL THEN
    SELECT COALESCE(j.master_job_id::text, j.progress->'meta'->>'sync_run_id', j.progress->'meta'->>'master_job_id')
    INTO v_sync_run_id
    FROM app.integration_sync_jobs j
    WHERE j.tenant_integration_id = p_tenant_integration_id
      AND j.deleted_at IS NULL
      AND j.status IN ('pending', 'queued', 'running', 'paused')
    ORDER BY j.created_at DESC
    LIMIT 1;

    IF v_sync_run_id IS NOT NULL THEN
      v_master_id := v_sync_run_id::uuid;
    END IF;
  END IF;

  UPDATE app.integration_sync_jobs
  SET
    status       = 'cancelled',
    progress     = jsonb_set(
                     COALESCE(progress, '{}'::jsonb),
                     '{phase}', '"cancelled"'
                   ) ||
                   jsonb_build_object(
                     'phase_label', 'Sync cancelled',
                     'updated_at',  v_now_iso,
                     'note',        'Stopped by user request.'
                   ),
    completed_at = v_now,
    updated_at   = v_now,
    updated_by   = p_actor_user_id
  WHERE tenant_integration_id = p_tenant_integration_id
    AND deleted_at IS NULL
    AND status IN ('pending', 'queued', 'running', 'paused')
    AND (
      v_sync_run_id IS NULL
      OR id::text = v_sync_run_id
      OR master_job_id::text = v_sync_run_id
      OR progress->'meta'->>'sync_run_id' = v_sync_run_id
      OR progress->'meta'->>'master_job_id' = v_sync_run_id
    );

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  IF v_master_id IS NOT NULL THEN
    UPDATE app.integration_sync_jobs
    SET progress = jsonb_set(
      COALESCE(progress, '{}'::jsonb),
      '{meta,run_cancelled}',
      'true'::jsonb,
      true
    ),
    updated_at = v_now,
    updated_by = p_actor_user_id
    WHERE id = v_master_id;
  END IF;

  IF v_cancelled_count = 0 THEN
    RETURN jsonb_build_object(
      'ok',                    false,
      'status',                'idle',
      'tenant_integration_id', p_tenant_integration_id,
      'message',               'No active sync jobs found.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',                    true,
    'status',                'cancelled',
    'cancelled_count',       v_cancelled_count,
    'tenant_integration_id', p_tenant_integration_id,
    'sync_run_id',           v_sync_run_id
  );
END;
$function$;
