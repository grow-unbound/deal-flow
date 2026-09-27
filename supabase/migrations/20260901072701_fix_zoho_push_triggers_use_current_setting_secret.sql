-- push-estimate-to-zoho / push-order-to-zoho used supabase_functions.http_request
-- directly on the CREATE TRIGGER, which bakes its headers argument as a static
-- literal evaluated at trigger-creation time, not per-invocation -- so the
-- secret silently goes stale on every INTEGRATIONS_PUSH_SECRET rotation and has
-- to be re-created by hand (20260831022518_fix_stale_push_to_zoho_secret, never
-- captured to a migration file since it hardcoded the live secret -- this
-- migration replaces it instead of repeating it).
--
-- Rewritten to the same pattern already proven by app.notify_whatsapp_dispatch
-- (20260712093040): a custom PL/pgSQL trigger function that reads
-- current_setting('app.integrations_dispatch_secret', true) at RUNTIME via
-- net.http_post, so a secret rotation only needs `ALTER DATABASE ... SET
-- app.integrations_dispatch_secret = '...'` -- no trigger DDL touched, no
-- secret ever committed to a migration file. verify-push-secret on the
-- receiving edge functions already accepts this same GUC's value (see
-- notify_whatsapp_dispatch's comment: "INTEGRATIONS_PUSH_SECRET ??
-- INTEGRATIONS_DISPATCH_SECRET").

CREATE OR REPLACE FUNCTION app.notify_zoho_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_secret text := current_setting('app.integrations_dispatch_secret', true);
  v_path   text := CASE TG_TABLE_NAME
    WHEN 'estimates' THEN 'push-estimate-to-zoho'
    WHEN 'orders' THEN 'push-order-to-zoho'
  END;
BEGIN
  PERFORM net.http_post(
    url := app.get_functions_base_url() || '/' || v_path,
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'x-push-secret', COALESCE(v_secret, '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.notify_zoho_push() FROM PUBLIC;
GRANT ALL ON FUNCTION app.notify_zoho_push() TO service_role;

DROP TRIGGER IF EXISTS "push-estimate-to-zoho" ON app.estimates;
CREATE TRIGGER "push-estimate-to-zoho"
  AFTER INSERT ON app.estimates
  FOR EACH ROW
  WHEN (NEW.source IS DISTINCT FROM 'zoho_import')
  EXECUTE FUNCTION app.notify_zoho_push();

DROP TRIGGER IF EXISTS "push-order-to-zoho" ON app.orders;
CREATE TRIGGER "push-order-to-zoho"
  AFTER INSERT ON app.orders
  FOR EACH ROW
  WHEN (NEW.source IS DISTINCT FROM 'zoho_import')
  EXECUTE FUNCTION app.notify_zoho_push();
