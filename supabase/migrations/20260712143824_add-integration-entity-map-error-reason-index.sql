-- Speeds up loadIntegrationsSettingsPayload's error-reason lookup
-- (src/lib/integrations/server.ts) — feeds ConnectedIntegrationCard's
-- error list. No existing index covers tenant_id + updated_at filtered on
-- error_reason IS NOT NULL; without it this scans all of a tenant's rows.
--
-- CONCURRENTLY: this table takes constant webhook/sync writes, so a plain
-- CREATE INDEX would hold an AccessExclusiveLock and block them for the
-- build duration. CONCURRENTLY cannot run inside a transaction block OR a
-- pipelined batch of statements — this file is already a single statement
-- so it's safe under `supabase db push` as-is. If it still errors with
-- "cannot be executed within a pipeline" or "cannot run inside a
-- transaction block", apply it via `supabase db query` / the SQL editor /
-- execute_sql individually instead (see the split
-- 20260712123528_idx_buyers_search_vector_concurrent.sql..20260712123541_*
-- files for the same pattern applied to a batch that originally failed
-- this way).
CREATE INDEX CONCURRENTLY IF NOT EXISTS integration_entity_map_error_reason_idx
  ON app.integration_entity_map (tenant_id, updated_at DESC)
  WHERE error_reason IS NOT NULL AND deleted_at IS NULL;
