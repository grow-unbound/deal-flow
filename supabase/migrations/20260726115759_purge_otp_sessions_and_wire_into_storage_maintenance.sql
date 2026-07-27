-- otp_sessions had no dedicated purge (46% dead tuples, autovacuum never run) --
-- app.run_storage_maintenance() covered other operational tables but not this one.
CREATE OR REPLACE FUNCTION app.purge_otp_sessions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'pg_catalog'
AS $function$
BEGIN
  DELETE FROM app.otp_sessions WHERE created_at < now() - interval '1 hour';
END;
$function$;

CREATE OR REPLACE FUNCTION app.run_storage_maintenance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.purge_cron_job_run_details();
  PERFORM app.purge_metrics_dirty_work();
  PERFORM app.purge_integration_webhook_events();
  PERFORM app.purge_net_http_response();
  PERFORM app.purge_supabase_hooks();
  PERFORM app.purge_otp_sessions();
END;
$function$;
