-- Add explicit master_job_id column so orchestration never depends on JSONB meta.
-- The old approach stored sync_run_id inside progress->meta, but updatePhaseJob
-- does a full JSONB column replace via buildProgress() which has no meta field —
-- stripping sync_run_id after the first page write and breaking:
--   • loadSlavesForRun (.contains('progress', {meta:{sync_run_id}}))
--   • reaper master-halt query (s.progress->'meta'->>'sync_run_id' = m.id)
--   • isRunReadyForAnalysis (returns no slaves → analysis never runs)

ALTER TABLE app.integration_sync_jobs
  ADD COLUMN IF NOT EXISTS master_job_id uuid
    REFERENCES app.integration_sync_jobs(id) ON DELETE RESTRICT;

-- Backfill from existing JSONB meta (best-effort; new rows set the column directly)
UPDATE app.integration_sync_jobs
SET master_job_id = (progress -> 'meta' ->> 'master_job_id')::uuid
WHERE phase != 'sync_run'
  AND master_job_id IS NULL
  AND (progress -> 'meta' ->> 'master_job_id') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_master_job_id
  ON app.integration_sync_jobs (master_job_id)
  WHERE master_job_id IS NOT NULL;

-- Fix cancel RPC: add master_job_id column match alongside JSONB fallbacks
CREATE OR REPLACE FUNCTION app.cancel_tenant_integration_sync_job(
  p_tenant_integration_id uuid,
  p_actor_user_id uuid
)
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
      OR master_job_id::text = v_sync_run_id          -- real column (fast)
      OR progress->'meta'->>'sync_run_id' = v_sync_run_id    -- JSONB fallback
      OR progress->'meta'->>'master_job_id' = v_sync_run_id  -- JSONB fallback
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

-- Fix reaper master-halt query: replace broken JSONB path with real column
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
  -- Slave rescue: running slaves that have made progress → pause them
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
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) > 0;

  -- Slave rescue: running slaves with no progress → fail them
  UPDATE app.integration_sync_jobs j
  SET status = 'failed',
      error_log = jsonb_build_object(
        'message', 'reaped: job stalled in running state with no progress for over 10 minutes',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) = 0;

  -- Master halt: use real master_job_id column instead of broken JSONB path
  UPDATE app.integration_sync_jobs m
  SET status = 'failed',
      progress = jsonb_set(
        COALESCE(m.progress, '{}'::jsonb),
        '{meta,run_halted}',
        'true'::jsonb,
        true
      ),
      completed_at = now(),
      updated_at = now()
  WHERE m.phase = 'sync_run'
    AND m.status IN ('running', 'paused')
    AND m.updated_at < now() - v_stale_after
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs s
      WHERE s.master_job_id = m.id   -- real column, not broken JSONB path
        AND s.status = 'running'
        AND s.updated_at < now() - v_stale_after
    );
END;
$$;
