-- Slack delivery for the ops daily digest (phase 2 of the daily morning
-- report infra). Mirrors app.get_integrations_dispatch_secret's vault
-- pattern: the webhook URL lives in Supabase Vault, never in a migration
-- file or env var checked into git.
--
-- Activation (author still needs to do this): run, from the SQL editor or
-- via execute_sql, once a Slack incoming webhook URL exists —
--   select vault.create_secret('<https://hooks.slack.com/... URL>', 'app.ops_slack_webhook_url', 'Slack incoming webhook for the daily ops digest');
-- Until that secret exists, the edge function no-ops (logs and returns ok)
-- rather than erroring.

create or replace function app.get_ops_slack_webhook_url()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'vault', 'app'
as $function$
  select (
    select ds.decrypted_secret
    from vault.decrypted_secrets ds
    where ds.name = 'app.ops_slack_webhook_url'
    limit 1
  );
$function$;

revoke all on function app.get_ops_slack_webhook_url() from public;
grant execute on function app.get_ops_slack_webhook_url() to postgres, service_role;

-- Nightly send: 03:25 UTC = 08:55 IST, 10 minutes after ops-daily-rollup
-- (03:15 UTC) so the rollup + flags for the prior IST day are already
-- computed. Same cron -> net.http_post -> edge function pattern as
-- app.notify_zoho_push.

select cron.schedule(
  'ops-daily-digest-send',
  '25 3 * * *',
  $$
  select net.http_post(
    url := app.get_functions_base_url() || '/ops-daily-digest',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'x-push-secret', app.get_integrations_dispatch_secret()
    ),
    body := jsonb_build_object('day', (((now() at time zone 'Asia/Kolkata')::date) - 1)::text),
    timeout_milliseconds := 10000
  );
  $$
);
