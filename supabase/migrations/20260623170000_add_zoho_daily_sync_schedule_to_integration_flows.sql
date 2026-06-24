-- Backfill the Zoho cockpit with the new daily cadence so existing connected
-- tenants can see their 5:00 AM refresh schedule immediately.

UPDATE app.integration_data_flows f
SET schedule = '0 5 * * *'
FROM app.tenant_integrations ti
WHERE f.tenant_integration_id = ti.id
  AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
  AND f.deleted_at IS NULL
  AND f.schedule IS NULL;
