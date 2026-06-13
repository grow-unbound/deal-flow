import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260612101152_integrations_hardening_and_runtime.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('integrations hardening migration', () => {
  it('drops authenticated write policies from integration tables while leaving reads to the foundation migration', () => {
    const droppedPolicies = [
      'DROP POLICY IF EXISTS tenant_integrations_insert ON app.tenant_integrations;',
      'DROP POLICY IF EXISTS tenant_integrations_update ON app.tenant_integrations;',
      'DROP POLICY IF EXISTS tenant_integrations_delete ON app.tenant_integrations;',
      'DROP POLICY IF EXISTS integration_sync_jobs_insert ON app.integration_sync_jobs;',
      'DROP POLICY IF EXISTS integration_sync_jobs_update ON app.integration_sync_jobs;',
      'DROP POLICY IF EXISTS integration_sync_jobs_delete ON app.integration_sync_jobs;',
      'DROP POLICY IF EXISTS integration_entity_map_insert ON app.integration_entity_map;',
      'DROP POLICY IF EXISTS integration_entity_map_update ON app.integration_entity_map;',
      'DROP POLICY IF EXISTS integration_entity_map_delete ON app.integration_entity_map;',
      'DROP POLICY IF EXISTS integration_webhooks_insert ON app.integration_webhooks;',
      'DROP POLICY IF EXISTS integration_webhooks_update ON app.integration_webhooks;',
      'DROP POLICY IF EXISTS integration_webhooks_delete ON app.integration_webhooks;',
      'DROP POLICY IF EXISTS integration_data_flows_insert ON app.integration_data_flows;',
      'DROP POLICY IF EXISTS integration_data_flows_update ON app.integration_data_flows;',
      'DROP POLICY IF EXISTS integration_data_flows_delete ON app.integration_data_flows;',
    ];
    const recreatedWritePolicies = [
      'CREATE POLICY tenant_integrations_insert ON app.tenant_integrations',
      'CREATE POLICY integration_sync_jobs_insert ON app.integration_sync_jobs',
      'CREATE POLICY integration_entity_map_insert ON app.integration_entity_map',
      'CREATE POLICY integration_webhooks_insert ON app.integration_webhooks',
      'CREATE POLICY integration_data_flows_insert ON app.integration_data_flows',
    ];

    droppedPolicies.forEach((policy) => expect(migrationSql).toContain(policy));
    recreatedWritePolicies.forEach((policy) => expect(migrationSql).not.toContain(policy));
  });

  it('enforces tenant consistency for child tables and guards webhook references', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app._assert_integration_child_tenant_consistency()');
    expect(migrationSql).toContain('IF NEW.tenant_id IS DISTINCT FROM v_tenant_integration.tenant_id THEN');
    expect(migrationSql).toContain('IF TG_TABLE_NAME = \'integration_data_flows\' AND NEW.webhook_id IS NOT NULL THEN');

    [
      'integration_sync_jobs_tenant_consistency',
      'integration_entity_map_tenant_consistency',
      'integration_webhooks_tenant_consistency',
      'integration_data_flows_tenant_consistency',
    ].forEach((triggerName) => {
      expect(migrationSql).toContain(`DROP TRIGGER IF EXISTS ${triggerName}`);
      expect(migrationSql).toContain(`CREATE TRIGGER ${triggerName}`);
    });
  });

  it('replaces the broad secret getter with scoped admin and runtime helpers', () => {
    expect(migrationSql).toContain('DROP FUNCTION IF EXISTS app.get_tenant_integration_secret(uuid);');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.get_tenant_integration_secret(');
    expect(migrationSql).toContain('p_actor_user_id uuid');
    expect(migrationSql).toContain('PERFORM app._tenant_integrations_assert_seller_admin');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.get_tenant_integration_runtime_secret(');
    expect(migrationSql).toContain('p_expected_integration_type_id text');
    expect(migrationSql).not.toContain('GRANT EXECUTE ON FUNCTION app.get_tenant_integration_secret(uuid) TO service_role;');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION app.get_tenant_integration_secret(uuid, uuid) TO service_role;');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION app.get_tenant_integration_runtime_secret(uuid, text) TO service_role;');
  });
});
