-- Add estimate_url column to app.estimates (used after reverse-sync push to Zoho)
ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS estimate_url text;

-- Add error_reason column to integration_entity_map for push failure tracking
ALTER TABLE app.integration_entity_map
  ADD COLUMN IF NOT EXISTS error_reason text;

-- Extend source enum on app.estimates to allow 'zoho_import' if not already present
-- (already done in 20260621071144_zoho_full_sync_schema.sql — this is a no-op guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estimates_source_check'
      AND pg_get_constraintdef(oid) LIKE '%zoho_import%'
  ) THEN
    ALTER TABLE app.estimates DROP CONSTRAINT IF EXISTS estimates_source_check;
    ALTER TABLE app.estimates
      ADD CONSTRAINT estimates_source_check
        CHECK (source IN ('buyer_app', 'seller', 'zoho_import'));
  END IF;
END $$;

-- Extend source enum on app.orders to allow 'zoho_import' if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_source_check'
      AND pg_get_constraintdef(oid) LIKE '%zoho_import%'
  ) THEN
    ALTER TABLE app.orders DROP CONSTRAINT IF EXISTS orders_source_check;
    ALTER TABLE app.orders
      ADD CONSTRAINT orders_source_check
        CHECK (source IN ('buyer_app', 'cockpit_manual', 'csv_import', 'zoho_import'));
  END IF;
END $$;

-- ── DB Webhooks (manual setup in Supabase Dashboard) ─────────────────────────
--
-- After deploying the two edge functions, create two DB Webhooks in the Supabase
-- Dashboard (Database → Webhooks → New Webhook):
--
-- 1. push-estimate-to-zoho:
--    Schema: app | Table: estimates | Event: INSERT
--    URL: {SUPABASE_URL}/functions/v1/push-estimate-to-zoho
--    Headers: x-push-secret: <INTEGRATIONS_PUSH_SECRET>
--
-- 2. push-order-to-zoho:
--    Schema: app | Table: orders | Event: INSERT
--    URL: {SUPABASE_URL}/functions/v1/push-order-to-zoho
--    Headers: x-push-secret: <INTEGRATIONS_PUSH_SECRET>
--
-- Required edge function secret (add to Supabase Edge Function Secrets):
--   INTEGRATIONS_PUSH_SECRET=<random-secret>
-- (or reuse INTEGRATIONS_DISPATCH_SECRET — both are checked in verifyPushSecret)