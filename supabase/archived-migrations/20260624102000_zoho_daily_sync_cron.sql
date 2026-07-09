-- Live Zoho daily sync scheduler.
-- This creates the 5:00 AM cron job that calls the integrations sync edge
-- function for every connected Zoho tenant that has active daily flows.
--
-- The scheduler uses a per-tenant token stored in app.tenant_settings so we do
-- not have to hard-code any secret into the cron body.

INSERT INTO app.tenant_settings (tenant_id, settings)
SELECT DISTINCT
  ti.tenant_id,
  CASE
    WHEN COALESCE(ts.settings ->> 'zoho_daily_sync_cron_token', '') <> '' THEN ts.settings
    ELSE jsonb_set(
      COALESCE(ts.settings, '{}'::jsonb),
      '{zoho_daily_sync_cron_token}',
      to_jsonb(gen_random_uuid()::text),
      true
    )
  END
FROM app.tenant_integrations ti
LEFT JOIN app.tenant_settings ts ON ts.tenant_id = ti.tenant_id
WHERE ti.deleted_at IS NULL
  AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
ON CONFLICT (tenant_id) DO UPDATE SET
  settings = CASE
    WHEN COALESCE(app.tenant_settings.settings ->> 'zoho_daily_sync_cron_token', '') <> '' THEN app.tenant_settings.settings
    ELSE jsonb_set(
      COALESCE(app.tenant_settings.settings, '{}'::jsonb),
      '{zoho_daily_sync_cron_token}',
      EXCLUDED.settings -> 'zoho_daily_sync_cron_token',
      true
    )
  END,
  updated_at = now();

CREATE OR REPLACE FUNCTION app.run_zoho_daily_sync_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_functions_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1/integrations-sync';
BEGIN
  PERFORM net.http_post(
    url := v_functions_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-zoho-cron-token', ts.settings ->> 'zoho_daily_sync_cron_token'
    ),
    body := jsonb_build_object(
      'tenant_integration_id', ti.id,
      'job_type', 'incremental',
      'run_origin', 'scheduled',
      'sync_window', 'Last 24 hours'
    )
  )
  FROM app.tenant_integrations ti
  JOIN app.tenant_settings ts ON ts.tenant_id = ti.tenant_id
  WHERE ti.deleted_at IS NULL
    AND ti.status = 'connected'
    AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
    AND COALESCE(ts.settings ->> 'zoho_daily_sync_cron_token', '') <> ''
    AND EXISTS (
      SELECT 1
      FROM app.integration_data_flows f
      WHERE f.tenant_integration_id = ti.id
        AND f.deleted_at IS NULL
        AND f.is_active = true
        AND f.schedule = '0 5 * * *'
    );
END;
$$;

REVOKE ALL ON FUNCTION app.run_zoho_daily_sync_cron() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-daily-syncs') THEN
      PERFORM cron.schedule(
        'zoho-daily-syncs',
        '0 5 * * *',
        'SELECT app.run_zoho_daily_sync_cron();'
      );
    END IF;
  END IF;
END;
$$;
