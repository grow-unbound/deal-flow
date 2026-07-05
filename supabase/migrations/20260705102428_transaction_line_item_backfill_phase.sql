-- Add the final transaction line-item hydration phase to the existing Zoho
-- orchestrator resume loop. Normal list phases continue through
-- integrations-sync; the detail-hydration phase resumes its own paused job.

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
        'batch_size', COALESCE((j.progress->'next_cursor'->>'per_page')::int, 25)
      )
      ELSE jsonb_build_object(
        'tenant_integration_id', ti.id,
        'job_type', 'incremental',
        'phase', j.phase,
        'page_from', (j.progress->'next_cursor'->>'page')::int
      )
    END
  )
  FROM app.tenant_integrations ti
  JOIN LATERAL (
    SELECT id, phase, progress
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

-- Initial transactional summaries need hydrated children. Defer the trigger's
-- rebuild for parent transaction sub-phases; the final line-item phase and the
-- explicit analysis job still rebuild after children exist.
CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    IF NEW.job_type = 'initial_transactional'
       AND NEW.phase IN ('estimates', 'orders', 'invoices') THEN
      RETURN NEW;
    END IF;

    PERFORM app.post_sync_rebuild(
      NEW.tenant_id,
      CASE NEW.job_type
        WHEN 'initial_reference'     THEN 90
        WHEN 'initial_transactional' THEN 90
        ELSE 2
      END
    );
  END IF;
  RETURN NEW;
END;
$$;
