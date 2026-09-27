-- 20260901072701 switched push-estimate/order triggers to
-- current_setting('app.integrations_dispatch_secret'). Hosted Supabase
-- denies ALTER DATABASE SET for custom GUCs (permission denied — same class
-- as 20260713133345), so the GUC is empty in every session. The edge
-- functions still have INTEGRATIONS_PUSH_SECRET, so x-push-secret: '' → 401
-- and the handler never runs. That migration also posted body '{}', which
-- parseWebhookRecord would skip even after auth succeeded.
--
-- Secret source: vault.secrets name 'app.integrations_dispatch_secret'
-- (seeded out of band — never committed). GUC still wins if a session has
-- it. Payload is the Dashboard webhook envelope so the existing parser
-- keeps working.
--
-- Filename matches yukti-prod schema_migrations.version from MCP apply.

CREATE OR REPLACE FUNCTION app.get_integrations_dispatch_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'vault', 'app'
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('app.integrations_dispatch_secret', true), ''),
    (
      SELECT ds.decrypted_secret
      FROM vault.decrypted_secrets ds
      WHERE ds.name = 'app.integrations_dispatch_secret'
      LIMIT 1
    ),
    ''
  );
$function$;

REVOKE ALL ON FUNCTION app.get_integrations_dispatch_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_integrations_dispatch_secret() TO postgres;
GRANT EXECUTE ON FUNCTION app.get_integrations_dispatch_secret() TO service_role;

CREATE OR REPLACE FUNCTION app.notify_zoho_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_secret text := app.get_integrations_dispatch_secret();
  v_path   text := CASE TG_TABLE_NAME
    WHEN 'estimates' THEN 'push-estimate-to-zoho'
    WHEN 'orders' THEN 'push-order-to-zoho'
  END;
BEGIN
  IF v_secret = '' THEN
    RAISE WARNING 'notify_zoho_push: missing app.integrations_dispatch_secret (vault + GUC empty)';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := app.get_functions_base_url() || '/' || v_path,
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'x-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.notify_zoho_push() FROM PUBLIC;
GRANT ALL ON FUNCTION app.notify_zoho_push() TO service_role;
