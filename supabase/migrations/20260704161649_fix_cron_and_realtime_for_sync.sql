-- Fix three compounding issues discovered while debugging a stuck Zoho sync:
--
-- 1. pg_cron was never installed on this project (list_extensions showed
--    installed_version: null). The earlier cron-setup migration guarded its
--    cron.schedule() call behind `IF EXISTS pg_extension pg_cron` and silently
--    no-op'd — there has been ZERO cron execution ever, not a timing issue.
--    Install the extension and reschedule at a much shorter interval (30s,
--    supported natively by pg_cron >=1.4 via interval-string schedules)
--    instead of every 5 minutes.
--
-- 2. app.integration_sync_jobs and app.tenant_integrations were never added to
--    the supabase_realtime publication (only campaigns/orders/invoices/
--    estimates were). The frontend's postgres_changes subscription in
--    useIntegrationsSettings.ts has been listening to a table that never
--    replicates any events — hence the need to manually refresh to see
--    updated status/progress.
--
-- 3. REPLICA IDENTITY FULL is required for postgres_changes filters on
--    non-primary-key columns (tenant_integration_id) to reliably match —
--    default replica identity only includes PK columns in the WAL stream.

CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE app.integration_sync_jobs REPLICA IDENTITY FULL;
ALTER TABLE app.tenant_integrations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'app' AND tablename = 'integration_sync_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app.integration_sync_jobs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'app' AND tablename = 'tenant_integrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app.tenant_integrations;
  END IF;
END;
$$;

-- Reschedule the orchestrator cron at 30s instead of 5min, now that pg_cron
-- actually exists to run it.
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'zoho-sync-orchestrator';
  PERFORM cron.schedule('zoho-sync-orchestrator', '30 seconds', 'SELECT app.run_zoho_orchestrator_cron()');
END;
$$;
