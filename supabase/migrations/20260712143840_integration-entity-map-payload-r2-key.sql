-- Move integration_entity_map.source_payload (jsonb) out to R2; keep a
-- relative object key instead. source_payload is write-only (confirmed no
-- runtime reads outside test assertions) — this is pure bloat reduction
-- (71MB table / 51MB idx+toast for 42K rows).
ALTER TABLE app.integration_entity_map
  ADD COLUMN IF NOT EXISTS source_payload_r2_key text;

COMMENT ON COLUMN app.integration_entity_map.source_payload_r2_key IS
  'Relative R2 object key holding the raw source payload JSON (see src/lib/r2-url.ts r2Url()). Deterministic per-row: integrations/{tenant_id}/entity-map/{id}.json. Set once on first sync of a row; NULL until backfilled.';

-- source_payload itself is intentionally NOT dropped in this migration.
-- Drop it in a follow-up migration only after the one-time backfill script
-- has verified every non-null source_payload row has a corresponding R2
-- object and a populated source_payload_r2_key.
