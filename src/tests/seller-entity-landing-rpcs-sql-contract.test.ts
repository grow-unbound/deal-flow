import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260714102906_seller_entity_landing_search_rpcs.sql'),
  'utf8',
);

describe('seller entity landing RPC SQL contracts', () => {
  it('uses maintained vectors with prefix matching and bounded deterministic pages', () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION app\.search_seller_/g)).toHaveLength(4);
    expect(migration.match(/search_vector @@ v_prefix_ts_query/g)).toHaveLength(4);
    expect(migration.match(/SELECT count\(\*\) AS total_count FROM candidates/g)).toHaveLength(4);
    expect(migration.match(/LIMIT v_limit OFFSET v_offset/g)).toHaveLength(4);
    expect(migration.match(/LEFT JOIN page ON true/g)).toHaveLength(4);
    expect(migration.match(/LEAST\(GREATEST\(COALESCE\(p_limit, 50\), 1\), 100\)/g)).toHaveLength(4);
    expect(migration.match(/LEAST\(GREATEST\(COALESCE\(p_offset, 0\), 0\), 10000\)/g)).toHaveLength(4);
  });

  it('returns the filtered total even when the requested page has no rows', () => {
    expect(migration.match(/FROM totals\s+LEFT JOIN page ON true/g)).toHaveLength(4);
    expect(migration).not.toContain('count(*) OVER ()');
  });

  it('pushes relational and snapshot filters into SQL before pagination', () => {
    expect(migration).toContain('FROM app.tenant_products tp');
    expect(migration).toContain('lower(tc.name) = ANY(v_categories) OR lower(cc.name) = ANY(v_categories)');
    expect(migration).toContain("(v_product_mode = 'has_products') = EXISTS");
    expect(migration).toContain('LEFT JOIN app.locations_snapshot ls');
    expect(migration).toContain('LEFT JOIN app.warehouses_snapshot ws');
  });

  it('keeps the resultset RPCs behind server-side authorization checks', () => {
    expect(migration.match(/SECURITY INVOKER/g)).toHaveLength(4);
    expect(migration.match(/PUBLIC, anon, authenticated/g)).toHaveLength(4);
    expect(migration.match(/TO service_role/g)).toHaveLength(4);
    expect(migration).not.toMatch(/TO authenticated, service_role/);
  });
});
