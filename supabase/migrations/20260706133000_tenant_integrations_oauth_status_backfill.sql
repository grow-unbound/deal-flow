-- tenant_integrations.status tracks OAuth connectivity only.
-- Historical sync job failures were incorrectly written as status='sync_failed'.
-- Sync health lives on app.integration_sync_jobs (status, error_log).

UPDATE app.tenant_integrations
SET status = 'connected', updated_at = now()
WHERE status = 'sync_failed'
  AND deleted_at IS NULL
  AND connected_at IS NOT NULL;

COMMENT ON COLUMN app.tenant_integrations.status IS
  'OAuth handshake state: pending_setup | connected | syncing | disconnected. Sync job outcomes are tracked on app.integration_sync_jobs.';
