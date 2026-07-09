-- Zoho entity map error logging and sync hardening.
-- Adds per-entity error_reason so failed syncs can be inspected later.

ALTER TABLE app.integration_entity_map
  ADD COLUMN IF NOT EXISTS error_reason text;

