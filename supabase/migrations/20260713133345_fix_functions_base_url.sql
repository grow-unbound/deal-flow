-- app.get_functions_base_url() fell back to a hardcoded URL for the wrong
-- project ref (ytlusgmlqxuosifeapkz) whenever app.functions_base_url wasn't
-- set. That fallback host doesn't resolve, so every net.http_post the
-- 15s cron tick (app.tick_sync_coordinator) made to sync-coordinator failed
-- at DNS ("Couldn't resolve host name"), and no sync phase ever dispatched.
--
-- Original fix attempted `alter database postgres set app.functions_base_url
-- = ...` but hosted Supabase denies ALTER DATABASE SET for custom GUCs
-- (permission denied to set parameter) even to the postgres role. Redefining
-- the function's hardcoded fallback directly is a normal DDL op and doesn't
-- need superuser.
CREATE OR REPLACE FUNCTION app.get_functions_base_url()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'app'
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('app.functions_base_url', true), ''),
    'https://hcpzbnmumbykdqveyjhr.supabase.co/functions/v1'
  );
$function$;
