import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('metrics phase 2 additive schema migration', () => {
  it('creates the Phase 2 read-model and coordination objects', () => {
    [
      'app.metrics_tenant_commercial_snapshot',
      'app.metrics_tenant_inventory_snapshot',
      'app.metrics_tenant_buyer_app_snapshot',
      'app.metrics_tenant_setup_snapshot',
      'app.metrics_location_snapshot',
      'app.metrics_buyer_snapshot',
      'app.metrics_product_snapshot',
      'app.metrics_tenant_daily',
      'app.metrics_location_daily',
      'app.metrics_dirty_work',
      'app.metrics_runtime_control',
      'app.metrics_refresh_state',
      'app.metrics_refresh_leases',
      'app.metrics_execution_history',
    ].forEach((objectName) => {
      expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS ${objectName}`);
    });

    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_dispatch_enabled');
  });

  it('keeps dispatcher and capture implementation out of Phase 2', () => {
    expect(migrationSql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER/i);
    expect(migrationSql).not.toMatch(/cron\.schedule/i);
    expect(migrationSql).not.toMatch(/supabase_realtime/i);
    expect(migrationSql).not.toContain('df_metrics_v2');
    expect(migrationSql).not.toContain('read_model_version');
    expect(migrationSql).not.toContain('metrics_mark_dirty');
    expect(migrationSql).not.toContain('metrics_claim_dirty_work');
    expect(migrationSql).not.toContain('metrics_refresh_tick');
  });

  it('does not add prohibited high-cardinality daily facts or stored membership payloads', () => {
    expect(migrationSql).not.toMatch(/metrics_.*(buyer|buyers|product|brand|category|warehouse|campaign|group|price_list|pricelist)_daily/i);
    expect(migrationSql).not.toMatch(/\b(uuid|text)\s*\[\]/i);
    expect(migrationSql).not.toMatch(/\bjsonb\b/i);
    expect(migrationSql).not.toMatch(/\bjson\b/i);
  });

  it('keeps operational tables within the approved convention exception', () => {
    const operationalSection = migrationSql.slice(
      migrationSql.indexOf('CREATE TABLE IF NOT EXISTS app.metrics_dirty_work'),
      migrationSql.indexOf('CREATE TABLE IF NOT EXISTS app.metrics_execution_history'),
    );

    expect(operationalSection).not.toContain('external_ref');
    expect(operationalSection).not.toContain('created_by');
    expect(operationalSection).not.toContain('updated_by');
    expect(operationalSection).not.toContain('deleted_at');
    expect(operationalSection).toContain('tenant_id uuid');
    expect(operationalSection).toContain('created_at timestamptz');
    expect(operationalSection).toContain('updated_at timestamptz');
  });

  it('adds RLS, explicit grants, and default-off dispatch helper semantics', () => {
    expect(migrationSql).toContain('ALTER TABLE app.metrics_dirty_work ENABLE ROW LEVEL SECURITY');
    expect(migrationSql).toContain('GRANT SELECT ON TABLE');
    expect(migrationSql).toContain('GRANT ALL ON TABLE');
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION app.metrics_dispatch_enabled(uuid) FROM PUBLIC');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION app.metrics_dispatch_enabled(uuid) TO authenticated, service_role');
    expect(migrationSql).toContain('COALESCE((');
    expect(migrationSql).toContain('), false)');
  });
});
