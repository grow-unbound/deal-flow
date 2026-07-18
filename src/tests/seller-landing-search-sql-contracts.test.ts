import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260714102221_seller_cohort_campaign_price_list_search.sql'),
  'utf8',
);

describe('seller landing search SQL contracts', () => {
  it('uses maintained vectors and applies tenant scope before the bounded result', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION app.search_seller_landing_entities');
    expect(migration.match(/search_vector @@ n\.ts_query/g)).toHaveLength(3);
    expect(migration).toContain("websearch_to_tsquery('english'");
    expect(migration).toContain("to_tsquery(\n          'english'");
    expect(migration.match(/search_vector @@ n\.prefix_ts_query/g)).toHaveLength(3);
    expect(migration.match(/tenant_id = p_tenant_id/g)).toHaveLength(3);
    expect(migration).toContain('LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)');
    expect(migration).toContain('LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000)');
    expect(migration).toContain('OFFSET (SELECT row_offset FROM normalized)');
    expect(migration).toContain('LEFT JOIN page ON true');
    expect(migration).not.toContain('count(*) OVER ()');
  });

  it('pushes cohort brand and campaign/price-list status filters into SQL', () => {
    expect(migration).toContain('c.allowed_tenant_brand_ids && n.brand_ids');
    expect(migration).toContain("'expiring_soon' = ANY(n.statuses)");
    expect(migration).toContain("'expired' = ANY(n.statuses)");
  });

  it('is unavailable to browser roles', () => {
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });
});
