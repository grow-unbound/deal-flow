-- Add explicit rule_type column to replace partial index discrimination.
-- Partial indexes cannot be used with UPSERT onConflict; a dedicated column
-- lets us use a standard unique index and simple UPSERT.
ALTER TABLE app.integration_webhooks
  ADD COLUMN IF NOT EXISTS rule_type text;

-- Backfill from existing event_types arrays
UPDATE app.integration_webhooks
SET rule_type = CASE
  WHEN event_types && ARRAY[
    'contact.deleted', 'item.deleted', 'estimate.deleted',
    'invoice.deleted', 'salesorder.deleted'
  ]::text[]
  THEN 'delete'
  ELSE 'add_edit'
END
WHERE rule_type IS NULL;

-- Drop all prior unique indexes (old single + both partial)
DROP INDEX IF EXISTS app.integration_webhooks_tenant_integration_entity_unique;
DROP INDEX IF EXISTS app.integration_webhooks_entity_delete_unique;
DROP INDEX IF EXISTS app.integration_webhooks_entity_upsert_unique;
DROP INDEX IF EXISTS app.integration_webhooks_entity_rule_unique;
DROP INDEX IF EXISTS app.integration_webhooks_entity_events_unique;

-- Single deterministic unique index
CREATE UNIQUE INDEX integration_webhooks_entity_rule_unique
  ON app.integration_webhooks (tenant_integration_id, provider, entity_type, rule_type)
  WHERE deleted_at IS NULL AND entity_type IS NOT NULL AND rule_type IS NOT NULL;
