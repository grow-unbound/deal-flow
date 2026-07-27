-- Consolidate Realtime down to a single table. integration_sync_jobs/tenant_integrations
-- kept cycling back into the publication via app.pause_sync_realtime()/resume_sync_realtime()
-- (called around Zoho sync runs) — decommissioning that feature entirely per this request,
-- along with the whatsapp_broadcasts/whatsapp_messages and the four core tables now
-- superseded by app.realtime_notifications (see previous migration).
ALTER PUBLICATION supabase_realtime ADD TABLE app.realtime_notifications;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'campaigns', 'estimates', 'invoices', 'orders',
    'integration_sync_jobs', 'tenant_integrations',
    'whatsapp_broadcasts', 'whatsapp_messages'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'app' AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE app.%I', v_table);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS app.pause_sync_realtime();
DROP FUNCTION IF EXISTS app.resume_sync_realtime();
