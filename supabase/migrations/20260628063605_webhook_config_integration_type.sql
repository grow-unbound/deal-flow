-- Backfill integration_type_id into integration_webhooks.webhook_config for rows
-- that predate the registration code change. Idempotent: skips rows that already
-- have the field set. Falls back to 'zoho_books' (safe: the system is Zoho Books only).
UPDATE app.integration_webhooks iw
SET webhook_config = COALESCE(iw.webhook_config, '{}'::jsonb)
  || jsonb_build_object(
       'integration_type_id',
       COALESCE(
         (
           SELECT ti.integration_type_id
           FROM app.tenant_integrations ti
           WHERE ti.id = iw.tenant_integration_id
           LIMIT 1
         ),
         'zoho_books'
       )
     )
WHERE iw.deleted_at IS NULL
  AND (iw.webhook_config ->> 'integration_type_id') IS NULL;
