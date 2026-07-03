CREATE OR REPLACE FUNCTION app.cancel_tenant_integration_sync_job(
  p_tenant_integration_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
declare
  v_tenant_integration app.tenant_integrations%rowtype;
  v_now timestamptz := now();
  v_now_iso text := to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_cancelled_count int;
begin
  select *
  into v_tenant_integration
  from app.tenant_integrations ti
  where ti.id = p_tenant_integration_id
    and ti.deleted_at is null;

  if not found then
    raise exception 'tenant integration not found' using errcode = 'P0002';
  end if;

  perform app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  -- Cancel ALL active-status jobs (pending, queued, running, paused) for this integration.
  -- The old version only cancelled one queued/running job via LIMIT 1; this left pending phase
  -- jobs (created upfront by integrations-sync) in place, causing the UI to show "Stop sync" again.
  UPDATE app.integration_sync_jobs
  SET
    status       = 'cancelled',
    progress     = jsonb_set(
                     coalesce(progress, '{}'::jsonb),
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
    AND status IN ('pending', 'queued', 'running', 'paused');

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  IF v_cancelled_count = 0 THEN
    return jsonb_build_object(
      'ok',                    false,
      'status',                'idle',
      'tenant_integration_id', p_tenant_integration_id,
      'message',               'No active sync jobs found.'
    );
  END IF;

  UPDATE app.tenant_integrations
  SET
    status               = 'connected',
    health_status        = coalesce(v_tenant_integration.health_status, 'ok'),
    last_health_check_at = v_now,
    updated_at           = v_now,
    updated_by           = p_actor_user_id
  WHERE id = p_tenant_integration_id;

  return jsonb_build_object(
    'ok',                    true,
    'status',                'cancelled',
    'cancelled_count',       v_cancelled_count,
    'tenant_integration_id', p_tenant_integration_id
  );
end;
$function$;
