-- Split integration_webhooks to one row per (entity_type, event_types subset).
-- add_edit row stores non-delete events; delete row stores the *.deleted event.
-- Discriminated by event_types content — no new column needed.
--
-- Two partial unique indexes replace the old single unique index:
-- one for rows whose event_types overlap the known *.deleted set (delete webhooks),
-- one for rows that don't (upsert webhooks).
-- Array && operator is IMMUTABLE — safe for index predicates.

DROP INDEX IF EXISTS integration_webhooks_tenant_integration_entity_unique;
DROP INDEX IF EXISTS integration_webhooks_entity_rule_unique;
DROP INDEX IF EXISTS integration_webhooks_entity_events_unique;

-- One delete-type webhook per entity
CREATE UNIQUE INDEX IF NOT EXISTS integration_webhooks_entity_delete_unique
  ON app.integration_webhooks (tenant_integration_id, provider, entity_type)
  WHERE deleted_at IS NULL
    AND entity_type IS NOT NULL
    AND event_types && ARRAY[
      'contact.deleted',
      'item.deleted',
      'estimate.deleted',
      'invoice.deleted',
      'salesorder.deleted'
    ]::text[];

-- One upsert-type webhook per entity
CREATE UNIQUE INDEX IF NOT EXISTS integration_webhooks_entity_upsert_unique
  ON app.integration_webhooks (tenant_integration_id, provider, entity_type)
  WHERE deleted_at IS NULL
    AND entity_type IS NOT NULL
    AND NOT (event_types && ARRAY[
      'contact.deleted',
      'item.deleted',
      'estimate.deleted',
      'invoice.deleted',
      'salesorder.deleted'
    ]::text[]);
