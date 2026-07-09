-- Fix two bugs blocking sync jobs from completing.
--
-- Bug 1 — run_zoho_orchestrator_cron(): lateral subquery selects only
--   (id, phase, progress) but the body references j.since_date (lines 34, 41).
--   Postgres raises "column j.since_date does not exist" on EVERY cron tick,
--   so paused jobs (including transaction_line_items) are never resumed.
--   Fix: add since_date to the lateral SELECT.
--
-- Bug 2 — trg_post_sync_rebuild(): calls post_sync_rebuild() with no exception
--   handling. If post_sync_rebuild fails (timeout or any error) the caller's
--   transaction — the UPDATE that set status='completed' — rolls back, leaving
--   the job permanently stuck at status='running'.
--   Fix: wrap PERFORM in BEGIN/EXCEPTION so failures emit a WARNING but do not
--   roll back the status transition. Also add SET statement_timeout = '0' so
--   the trigger wrapper is not bound by the authenticator role's 8s session
--   limit (post_sync_rebuild already has its own 120s override from migration
--   20260706073128, but the trigger wrapper also needs to be unconstrained).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. run_zoho_orchestrator_cron — add since_date to lateral subquery
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
BEGIN
  PERFORM app.reap_stale_sync_jobs();

  PERFORM net.http_post(
    url := v_base_url || CASE
      WHEN j.phase = 'transaction_line_items' THEN '/sync-transaction-line-items'
      ELSE '/integrations-sync'
    END,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-integrations-dispatch-secret', COALESCE(v_secret, '')
    ),
    body := CASE
      WHEN j.phase = 'transaction_line_items' THEN jsonb_build_object(
        'tenant_integration_id', ti.id,
        'job_id', j.id,
        'page_from', (j.progress->'next_cursor'->>'page')::int,
        'batch_size', COALESCE((j.progress->'next_cursor'->>'per_page')::int, 25),
        'since', j.since_date
      )
      ELSE jsonb_build_object(
        'tenant_integration_id', ti.id,
        'job_type', 'incremental',
        'phase', j.phase,
        'page_from', (j.progress->'next_cursor'->>'page')::int,
        'since', j.since_date
      )
    END
  )
  FROM app.tenant_integrations ti
  JOIN LATERAL (
    SELECT id, phase, progress, since_date  -- was missing since_date; caused column-not-exist error on every cron tick
    FROM app.integration_sync_jobs
    WHERE tenant_integration_id = ti.id
      AND status = 'paused'
      AND progress->'next_cursor' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  ) j ON true
  WHERE ti.deleted_at IS NULL
    AND ti.status = 'connected'
    AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory');

  IF v_hour = 5 AND v_min < 5 THEN
    PERFORM net.http_post(
      url := v_base_url || '/integrations-sync',
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
      AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
      AND NOT EXISTS (
        SELECT 1 FROM app.integration_sync_jobs j2
        WHERE j2.tenant_integration_id = ti.id
          AND j2.status IN ('running', 'queued', 'paused')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.integration_sync_jobs
    WHERE status IN ('running', 'paused', 'queued', 'pending')
       OR created_at > now() - interval '24 hours'
  ) THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'zoho-sync-orchestrator';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. trg_post_sync_rebuild — exception guard + unrestricted timeout wrapper
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
    -- Skip Phase 3 for intermediate sub-phases of initial_transactional; the
    -- transaction_line_items completion triggers the rebuild once children exist.
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
