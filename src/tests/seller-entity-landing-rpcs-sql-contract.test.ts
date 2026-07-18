import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const searchMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260714102906_seller_entity_landing_search_rpcs.sql'),
  'utf8',
);
const completionMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260716110313_metrics_v2_phase_6_wave_c_completion.sql'),
  'utf8',
);

describe('seller entity landing RPC SQL contracts', () => {
  it('uses maintained vectors with prefix matching and bounded deterministic pages', () => {
    expect(searchMigration.match(/CREATE OR REPLACE FUNCTION app\.search_seller_/g)).toHaveLength(4);
    expect(searchMigration.match(/search_vector @@ v_prefix_ts_query/g)).toHaveLength(4);
    expect(searchMigration.match(/SELECT count\(\*\) AS total_count FROM candidates/g)).toHaveLength(4);
    expect(searchMigration.match(/LIMIT v_limit OFFSET v_offset/g)).toHaveLength(4);
    expect(searchMigration.match(/LEFT JOIN page ON true/g)).toHaveLength(4);
    expect(searchMigration.match(/LEAST\(GREATEST\(COALESCE\(p_limit, 50\), 1\), 100\)/g)).toHaveLength(4);
    expect(searchMigration.match(/LEAST\(GREATEST\(COALESCE\(p_offset, 0\), 0\), 10000\)/g)).toHaveLength(4);
  });

  it('returns the filtered total even when the requested page has no rows', () => {
    expect(searchMigration.match(/FROM totals\s+LEFT JOIN page ON true/g)).toHaveLength(4);
    expect(searchMigration).not.toContain('count(*) OVER ()');
  });

  it('pushes relational and snapshot filters into SQL before pagination', () => {
    expect(searchMigration).toContain('FROM app.tenant_products tp');
    expect(searchMigration).toContain('lower(tc.name) = ANY(v_categories) OR lower(cc.name) = ANY(v_categories)');
    expect(searchMigration).toContain("(v_product_mode = 'has_products') = EXISTS");
  });

  it('retires the remaining live legacy snapshot reads in the completion migration', () => {
    expect(completionMigration).toContain('app.metrics_location_snapshot');
    expect(completionMigration).toContain('app.metrics_location_daily');
    expect(completionMigration).toContain('app.metrics_product_snapshot');
    expect(completionMigration).toContain('app.tenant_inventory');
    expect(completionMigration).not.toContain('app.locations_snapshot');
    expect(completionMigration).not.toContain('app.warehouses_snapshot');
    expect(completionMigration).not.toContain('app.kpi_location_daily');
    expect(completionMigration).not.toContain('app.kpi_category_daily');
    expect(completionMigration).not.toContain('app.categories_snapshot');
    expect(completionMigration).not.toContain('app.brands_snapshot');
  });

  it('keeps the resultset RPCs behind server-side authorization checks', () => {
    expect(searchMigration.match(/SECURITY INVOKER/g)).toHaveLength(4);
    expect(searchMigration.match(/PUBLIC, anon, authenticated/g)).toHaveLength(4);
    expect(searchMigration.match(/TO service_role/g)).toHaveLength(4);
    expect(searchMigration).not.toMatch(/TO authenticated, service_role/);
  });
});
