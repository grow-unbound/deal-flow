-- Idempotently enable Supabase Realtime for all 6 tables that have frontend subscriptions.
-- Previous migrations (20260616100000, 20260704161649) may not have been applied to prod.
-- This migration is safe to run multiple times — the IF NOT EXISTS guard prevents duplicates.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estimates',
    'orders',
    'invoices',
    'campaigns',
    'integration_sync_jobs',
    'tenant_integrations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'app'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE app.%I', t);
    END IF;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL is required for:
--   • Filtering by non-PK columns (tenant_id, buyer_id, tenant_integration_id)
--   • UPDATE/DELETE change detection (old row values available)
ALTER TABLE app.estimates             REPLICA IDENTITY FULL;
ALTER TABLE app.orders                REPLICA IDENTITY FULL;
ALTER TABLE app.invoices              REPLICA IDENTITY FULL;
ALTER TABLE app.campaigns             REPLICA IDENTITY FULL;
ALTER TABLE app.integration_sync_jobs REPLICA IDENTITY FULL;
ALTER TABLE app.tenant_integrations   REPLICA IDENTITY FULL;
