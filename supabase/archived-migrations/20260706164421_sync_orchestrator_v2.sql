-- Sync orchestrator v2: master-slave runs, self-chain continuations, no 30s cron resume.
-- Lifecycle state lives on integration_sync_jobs only — tenant_integrations.status untouched.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Reaper — safety net only; never reset tenant_integrations.status
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Halt active master runs that still have stuck running slaves after reaper pass.
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
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs s
      WHERE s.progress->'meta'->>'sync_run_id' = m.id::text
        AND s.status = 'running'
        AND s.updated_at < now() - v_stale_after
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Daily kickoff + reaper only (no paused-job resume loop)
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_since    date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
BEGIN
  PERFORM app.reap_stale_sync_jobs();

  -- Daily incremental sync at 05:00–05:04 IST for tenants without an active master run.
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
        'since', to_char(v_since, 'YYYY-MM-DD')
      )
    )
    FROM app.tenant_integrations ti
    WHERE ti.deleted_at IS NULL
      AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
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

-- Replace high-frequency orchestrator with daily schedule (reaper + 5AM kickoff).
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

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-orchestrator') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'zoho-sync-orchestrator';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-daily') THEN
    -- 23:30 UTC ≈ 05:00 IST
    PERFORM cron.schedule('zoho-sync-daily', '30 23 * * *', 'SELECT app.run_zoho_orchestrator_cron()');
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM app.ensure_zoho_sync_cron_scheduled();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cancel RPC — master + all slaves in run; no tenant_integrations mutation
-- ─────────────────────────────────────────────────────────────────────────────
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
    SELECT COALESCE(j.progress->'meta'->>'sync_run_id', j.progress->'meta'->>'master_job_id')
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Defer per-phase post_sync_rebuild during orchestrated runs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
SET statement_timeout = '0'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    IF NEW.phase IS DISTINCT FROM 'analysis'
       AND (
         NEW.progress->'meta'->>'sync_run_id' IS NOT NULL
         OR NEW.progress->'meta'->>'master_job_id' IS NOT NULL
       ) THEN
      RETURN NEW;
    END IF;

    IF NEW.job_type = 'initial_transactional'
       AND NEW.phase IN ('estimates', 'orders', 'invoices') THEN
      RETURN NEW;
    END IF;

    BEGIN
      PERFORM app.post_sync_rebuild(
        NEW.tenant_id,
        CASE NEW.job_type
          WHEN 'initial_reference'     THEN 90
          WHEN 'initial_transactional' THEN 90
          ELSE 2
        END
      );
    EXCEPTION WHEN others THEN
      RAISE WARNING '[trg_post_sync_rebuild] post_sync_rebuild failed for job % (phase=%, type=%): %',
        NEW.id, NEW.phase, NEW.job_type, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
