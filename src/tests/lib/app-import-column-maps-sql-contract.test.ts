import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('supabase/migrations/20260902120000_app_import_column_maps.sql'),
  'utf8',
);

describe('app.import_column_maps SQL contract', () => {
  it('is tenant-scoped, hashed, and service-role only', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app.import_column_maps');
    expect(sql).toContain('tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT');
    expect(sql).toContain('header_hash text NOT NULL');
    expect(sql).toContain('ON app.import_column_maps (tenant_id, header_hash)');
    expect(sql).toContain('REVOKE ALL ON TABLE app.import_column_maps FROM anon, authenticated');
    expect(sql).toContain('GRANT ALL ON TABLE app.import_column_maps TO service_role');
  });
});
