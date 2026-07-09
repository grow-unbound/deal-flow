ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_tenant_integration_entity_unique;

ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_tenant_integration_entity_unique
  UNIQUE (tenant_id, tenant_integration_id, entity_type);
