-- Fix cron-invoked functions pointing at a dead/wrong Supabase project ref,
-- disable the legacy per-phase cron dispatcher superseded by the master/slave
-- orchestrator, and shorten the reaper's pending-dispatch-lost recovery
-- window.
--
-- Root cause (see yesterday's incident review): app.tick_sync_coordinator,
-- app.run_zoho_orchestrator_cron, app.run_zoho_sync_phase, and the unused
-- app.run_zoho_daily_sync_cron all hardcoded
-- 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1' as their dispatch
-- base URL — a project ref that matches neither yukti-dev
-- (jqcwpljkczrgxfdwqyrv) nor yukti-prod (ytlusgmlqxuosifeapkz), confirmed via
-- list_projects. Every net.http_post these functions issued went nowhere:
--   - The 05:00 IST daily incremental trigger silently never reached
--     integrations-sync.
--   - tick_sync_coordinator (every 15s) never reached sync-coordinator, so
--     the ONLY backstop for a lost dispatchContinuation call (documented in
--     integrations-sync/index.ts's own comment: "the pending slave will be
--     rescued by the reaper after 10 min") was non-functional — a slave the
--     reaper revived to 'pending' had nothing to actually dispatch it, so it
--     just re-went-stale and burned through its 3 revival attempts before
--     permanently failing with "reaped: exceeded revival cap — pending slave
--     dispatch repeatedly lost or orphaned".
--
-- Centralizing the base URL in one helper means a future project migration
-- only needs one update, not N greppable call sites.

CREATE OR REPLACE FUNCTION app.get_functions_base_url()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'app'
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.functions_base_url', true), ''),
    'https://ytlusgmlqxuosifeapkz.supabase.co/functions/v1'
  );
$$;

CREATE OR REPLACE FUNCTION app.tick_sync_coordinator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_base_url text := app.get_functions_base_url();
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
  v_lease    interval := interval '4 minutes';
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
$function$;

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
$function$;

-- Legacy pre-orchestrator per-phase dispatcher — bypasses the master/slave
-- system entirely (no job_id sent, so the invoked phase function never
-- attaches to a tracked job row at all). Superseded by
-- run_zoho_orchestrator_cron. Fixed for correctness/consistency, but its
-- cron jobs are disabled below — kept as a function only in case anything
-- still references it directly.
CREATE OR REPLACE FUNCTION app.run_zoho_sync_phase(p_function_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_base_url text := app.get_functions_base_url();
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
BEGIN
  PERFORM net.http_post(
    url := v_base_url || '/' || p_function_name,
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
    AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory');
END;
$function$;

-- Unscheduled (no cron.job references it) but still callable dead code from
-- an even earlier design — fixed for correctness in case anything still
-- calls it directly, not re-enabled.
CREATE OR REPLACE FUNCTION app.run_zoho_daily_sync_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_functions_url text := app.get_functions_base_url() || '/integrations-sync';
BEGIN
  PERFORM net.http_post(
    url := v_functions_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-zoho-cron-token', ts.settings ->> 'zoho_daily_sync_cron_token'
    ),
    body := jsonb_build_object(
      'tenant_integration_id', ti.id,
      'job_type', 'incremental',
      'run_origin', 'scheduled',
      'sync_window', 'Last 24 hours'
    )
  )
  FROM app.tenant_integrations ti
  JOIN app.tenant_settings ts ON ts.tenant_id = ti.tenant_id
  WHERE ti.deleted_at IS NULL
    AND ti.status = 'connected'
    AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
    AND COALESCE(ts.settings ->> 'zoho_daily_sync_cron_token', '') <> ''
    AND EXISTS (
      SELECT 1
      FROM app.integration_data_flows f
      WHERE f.tenant_integration_id = ti.id
        AND f.deleted_at IS NULL
        AND f.is_active = true
        AND f.schedule = '0 5 * * *'
    );
END;
$function$;

-- Disable the legacy per-phase cron dispatcher (jobs 11-17): sync-locations-
-- daily, sync-products-daily, sync-pricelists-daily, sync-customers-daily,
-- sync-estimates-daily, sync-orders-daily, sync-invoices-daily. All call
-- app.run_zoho_sync_phase, which bypasses the master/slave orchestrator —
-- now that the URL is fixed these would start actually firing and creating
-- untracked, duplicate, un-orchestrated sync jobs alongside the real
-- zoho-sync-daily run. Kept as inspectable (active=false), not unscheduled,
-- in case anyone needs to see the historical schedule.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.alter_job(jobid, active := false)
    FROM cron.job
    WHERE jobname IN (
      'sync-locations-daily',
      'sync-products-daily',
      'sync-pricelists-daily',
      'sync-customers-daily',
      'sync-estimates-daily',
      'sync-orders-daily',
      'sync-invoices-daily'
    );
  END IF;
END;
$$;

-- Shorten the pending-dispatch-lost detection window: 2 minutes -> 1 minute.
-- Combined with the reaper's own cron cadence below, this roughly halves the
-- end-to-end time from "dispatch lost" to "permanently failed after 3
-- revival attempts" (~10min -> ~5min) — safe to tighten now that revival is
-- capped at v_max_attempts=3 (the original incident this whole redesign
-- responded to was an UNCAPPED tight-cadence reaper; this one can never
-- retry more than 3 times regardless of cadence).
CREATE OR REPLACE FUNCTION app.reap_stale_sync_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_running_stale_after  interval := interval '5 minutes';
  v_dispatch_lost_after  interval := interval '1 minute';
  v_max_attempts         int      := 3;
  v_backoff_base_secs    numeric  := 30;
  v_backoff_multiplier   numeric  := 3;
BEGIN
  -- 1. Running slaves stale beyond lease, still under the revival cap,
  --    belonging to a still-active master → bounded revive.
  UPDATE app.integration_sync_jobs j
  SET status                 = 'pending',
      attempt_count           = COALESCE(j.attempt_count, 0) + 1,
      next_retry_eligible_at  = now() + make_interval(secs => v_backoff_base_secs * power(v_backoff_multiplier, COALESCE(j.attempt_count, 0))),
      updated_at              = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_running_stale_after
    AND COALESCE(j.attempt_count, 0) < v_max_attempts
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs m
      WHERE m.id = j.master_job_id AND m.phase = 'sync_run' AND m.status IN ('pending', 'running', 'paused')
    );

  -- 2. Running slaves stale beyond lease, revival cap already exhausted,
  --    still belonging to an active master → permanently fail.
  UPDATE app.integration_sync_jobs j
  SET status       = 'failed',
      attempt_count = COALESCE(j.attempt_count, 0) + 1,
      error_log    = jsonb_build_object(
        'message',   'reaped: exceeded revival cap while stalled in running state with no heartbeat',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_running_stale_after
    AND COALESCE(j.attempt_count, 0) >= v_max_attempts
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs m
      WHERE m.id = j.master_job_id AND m.phase = 'sync_run' AND m.status IN ('pending', 'running', 'paused')
    );

  -- 3. Pending slaves whose dispatch was lost, still under cap, belonging to
  --    a still-active master → bounded revive.
  UPDATE app.integration_sync_jobs j
  SET attempt_count           = COALESCE(j.attempt_count, 0) + 1,
      next_retry_eligible_at  = now() + make_interval(secs => v_backoff_base_secs * power(v_backoff_multiplier, COALESCE(j.attempt_count, 0))),
      updated_at              = now()
  WHERE j.status = 'pending'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.master_job_id IS NOT NULL
    AND j.updated_at < now() - v_dispatch_lost_after
    AND (j.next_retry_eligible_at IS NULL OR j.next_retry_eligible_at < now())
    AND COALESCE(j.attempt_count, 0) < v_max_attempts
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs m
      WHERE m.id = j.master_job_id AND m.phase = 'sync_run' AND m.status IN ('pending', 'running', 'paused')
    );

  -- 4. Pending slaves whose dispatch was lost, cap exhausted → permanently
  --    fail. Deliberately NOT gated on the master still being active — an
  --    orphaned slave under an already-terminal master must still get
  --    cleaned out of 'pending' once stale.
  UPDATE app.integration_sync_jobs j
  SET status       = 'failed',
      attempt_count = COALESCE(j.attempt_count, 0) + 1,
      error_log    = jsonb_build_object(
        'message',   'reaped: exceeded revival cap — pending slave dispatch repeatedly lost or orphaned',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE j.status = 'pending'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.master_job_id IS NOT NULL
    AND j.updated_at < now() - v_dispatch_lost_after
    AND (j.next_retry_eligible_at IS NULL OR j.next_retry_eligible_at < now())
    AND COALESCE(j.attempt_count, 0) >= v_max_attempts;

  -- 5. Master halt: any active master with at least one permanently-failed
  --    slave (matched by message, not by how recently it happened — a
  --    permanent failure means "never auto-retry", so the master should
  --    halt regardless of when that conclusion was reached, including
  --    across a migration deploy landing in between).
  UPDATE app.integration_sync_jobs m
  SET status       = 'failed',
      progress     = jsonb_set(
        COALESCE(m.progress, '{}'::jsonb),
        '{meta,run_halted}',
        'true'::jsonb,
        true
      ),
      completed_at = now(),
      updated_at   = now()
  WHERE m.phase = 'sync_run'
    AND m.status IN ('running', 'paused')
    AND EXISTS (
      SELECT 1
      FROM app.integration_sync_jobs s
      WHERE s.master_job_id = m.id
        AND s.status = 'failed'
        AND (
          s.error_log->>'message' LIKE 'reaped: exceeded revival cap%'
          OR s.error_log->>'message' LIKE 'reaped: pending slave never dispatched%'
        )
    );
END;
$function$;

-- Match the reaper's own cadence to the shortened detection window — every
-- 1 minute instead of every 2. Still a bounded, capped operation (max 3
-- revival attempts regardless of how often this runs), so a tighter cadence
-- is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.alter_job(jobid, schedule := '*/1 * * * *')
    FROM cron.job
    WHERE jobname = 'sync-reaper-backstop';
  END IF;
END;
$$;
