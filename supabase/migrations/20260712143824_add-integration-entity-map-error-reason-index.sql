-- Speeds up loadIntegrationsSettingsPayload's error-reason lookup
-- (src/lib/integrations/server.ts) — feeds ConnectedIntegrationCard's
-- error list. No existing index covers tenant_id + updated_at filtered on
-- error_reason IS NOT NULL; without it this scans all of a tenant's rows.
CREATE INDEX IF NOT EXISTS integration_entity_map_error_reason_idx
  ON app.integration_entity_map (tenant_id, updated_at DESC)
  WHERE error_reason IS NOT NULL AND deleted_at IS NULL;
