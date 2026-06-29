-- Sequential staggered sync cron schedule (wineyard pattern).
--
-- Replaces the old `zoho-daily-syncs` job (which called integrations-sync and dispatched
-- all phases concurrently) with 7 separate cron jobs staggered 5 minutes apart.
-- Only one entity sync runs at a time, keeping Zoho API calls strictly sequential
-- and eliminating the code-43 rate limit errors from concurrent phase dispatch.
--
-- Dependency order is preserved across the staggered windows:
--   locations → products → pricelists → customers → estimates → orders → invoices
--
-- Auth: uses x-integrations-dispatch-secret header (same secret as internal worker dispatch).
-- Status check: only syncs tenants with status='connected' (not pending_setup/disconnected).

-- Remove the old concurrent-dispatch cron job (only if pg_cron is installed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $dyn$
      DO $inner$
      BEGIN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-daily-syncs') THEN
          PERFORM cron.unschedule('zoho-daily-syncs');
        END IF;
      END;
      $inner$
    $dyn$;
  END IF;
END;
$$;

-- Shared dispatch function factory:
-- Each entity gets its own named function to call its sync-* edge function.
-- Uses the same hardcoded project URL as the existing run_zoho_daily_sync_cron().

CREATE OR REPLACE FUNCTION app.run_zoho_sync_phase(p_function_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_base_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1';
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
$$;

REVOKE ALL ON FUNCTION app.run_zoho_sync_phase(text) FROM PUBLIC;

-- Schedule 7 staggered cron jobs (all times UTC; IST = UTC+5:30)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping cron schedule registration';
    RETURN;
  END IF;

  -- All cron.* references must be in dynamic SQL so Postgres doesn't try to
  -- resolve the schema at parse time when pg_cron is absent.
  EXECUTE $dyn$
    DO $inner$
    BEGIN
      -- 05:00 IST = 23:30 UTC — locations (reference; no FK deps)
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-locations-daily') THEN
        PERFORM cron.schedule('sync-locations-daily', '30 23 * * *',
          'SELECT app.run_zoho_sync_phase(''sync-locations'');');
      END IF;

      -- 05:05 IST = 23:35 UTC — products (depends on locations)
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-products-daily') THEN
        PERFORM cron.schedule('sync-products-daily', '35 23 * * *',
          'SELECT app.run_zoho_sync_phase(''sync-products'');');
      END IF;

      -- 05:10 IST = 23:40 UTC — pricelists (depends on products)
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-pricelists-daily') THEN
        PERFORM cron.schedule('sync-pricelists-daily', '40 23 * * *',
          'SELECT app.run_zoho_sync_phase(''sync-pricelists'');');
      END IF;

      -- 05:15 IST = 23:45 UTC — customers (depends on pricelists for price_list_assignments)
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-customers-daily') THEN
        PERFORM cron.schedule('sync-customers-daily', '45 23 * * *',
          'SELECT app.run_zoho_sync_phase(''sync-customers'');');
      END IF;

      -- 05:20 IST = 23:50 UTC — estimates (transactional; depends on customers)
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-estimates-daily') THEN
        PERFORM cron.schedule('sync-estimates-daily', '50 23 * * *',
          'SELECT app.run_zoho_sync_phase(''sync-estimates'');');
      END IF;

      -- 05:25 IST = 23:55 UTC — orders (transactional; depends on customers + products)
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-orders-daily') THEN
        PERFORM cron.schedule('sync-orders-daily', '55 23 * * *',
          'SELECT app.run_zoho_sync_phase(''sync-orders'');');
      END IF;

      -- 05:30 IST = 00:00 UTC — invoices (transactional; final phase)
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-invoices-daily') THEN
        PERFORM cron.schedule('sync-invoices-daily', '0 0 * * *',
          'SELECT app.run_zoho_sync_phase(''sync-invoices'');');
      END IF;
    END;
    $inner$
  $dyn$;

END;
$$;
