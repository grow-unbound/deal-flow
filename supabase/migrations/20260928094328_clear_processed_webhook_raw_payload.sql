-- integration_webhook_events.raw_payload (~6 KB/row) is written for audit but no
-- code reads it back: processing uses the in-memory payload, and the only reader
-- (src/lib/integrations/server.ts) selects tenant_integration_id / entity_type /
-- processing_status / received_at. Keep it while an event is unresolved
-- ('received' / 'processing' / 'failed', useful for debugging) and clear it once
-- the event is 'processed' or 'ignored'. A BEFORE trigger covers every update
-- site in the edge functions without redeploying them.

CREATE OR REPLACE FUNCTION app.clear_processed_webhook_raw_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'app'
AS $function$
BEGIN
  IF NEW.processing_status IN ('processed', 'ignored') THEN
    NEW.raw_payload := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS integration_webhook_events_clear_raw_payload ON app.integration_webhook_events;
CREATE TRIGGER integration_webhook_events_clear_raw_payload
  BEFORE INSERT OR UPDATE OF processing_status, raw_payload ON app.integration_webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION app.clear_processed_webhook_raw_payload();

-- Backfill events already resolved. Space is reused by later inserts once the
-- nightly VACUUM runs; it is not returned to the OS without a table rewrite.
UPDATE app.integration_webhook_events
SET raw_payload = '{}'::jsonb
WHERE processing_status IN ('processed', 'ignored')
  AND raw_payload <> '{}'::jsonb;
