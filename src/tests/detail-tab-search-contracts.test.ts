import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase/migrations/20260714102636_detail_tab_bounded_search.sql'),
  'utf8',
);
const routeSources = [
  'app/api/tenant/brands/[id]/buyers/route.ts',
  'app/api/tenant/catalogs/[id]/buyers/route.ts',
  'app/api/tenant/warehouses/[id]/stock/route.ts',
].map((path) => readFileSync(join(root, path), 'utf8'));
const customerDocumentsRoute = readFileSync(
  join(root, 'app/api/tenant/customers/[id]/documents/route.ts'),
  'utf8',
);

describe('bounded detail-tab search contracts', () => {
  it('uses the english vector configuration with exact and prefix FTS', () => {
    expect(migration.match(/websearch_to_tsquery\('english'/g)).toHaveLength(3);
    expect(migration.match(/to_tsquery\('english', prefix_text\)/g)).toHaveLength(3);
    expect(migration.match(/search_vector @@ q\.prefix_query/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).not.toContain("websearch_to_tsquery('simple'");
    expect(migration).not.toContain('app.escape_like');
    expect(migration).not.toMatch(/\bilike\b/i);
  });

  it('applies FTS candidate selection before transactional aggregation and hydration', () => {
    expect(migration.indexOf('candidate_buyers as materialized')).toBeLessThan(migration.indexOf('metrics as materialized'));
    expect(migration).toContain('join candidate_buyers b on b.id = o.buyer_id');
    expect(migration).toContain('join audience_ids a on a.id = o.buyer_id');
    expect(migration).toContain('join audience_ids a on a.id = e.buyer_id');
    expect(migration).toContain('tp.search_vector @@ q.prefix_query');
  });

  it('keeps all read RPCs service-role-only and tenant-scoped', () => {
    expect(migration.match(/security definer/gi)).toHaveLength(3);
    expect(migration.match(/revoke all on function app\.search_/gi)).toHaveLength(3);
    expect(migration.match(/grant execute on function app\.search_/gi)).toHaveLength(3);
    expect(migration.match(/to service_role;/gi)).toHaveLength(3);
    expect(migration.match(/p_tenant_id/g).length).toBeGreaterThanOrEqual(12);
    expect(migration).not.toMatch(/grant execute[\s\S]*to authenticated;/i);
  });

  it('caps every RPC page and bounds every route request', () => {
    expect(migration.match(/limit least\(greatest\(coalesce\(p_limit, 50\), 1\), 100\)/gi)).toHaveLength(3);
    expect(migration.match(/offset greatest\(coalesce\(p_offset, 0\), 0\)/gi)).toHaveLength(3);
    for (const source of routeSources) {
      expect(source).toContain('claims.tenant_id');
      expect(source).toMatch(/p_tenant_id: claims\.tenant_id/);
    }
  });

  it('keeps customer document search lexical, indexed, location-scoped, and paged', () => {
    expect(customerDocumentsRoute).toContain("query.ilike(config.number");
    expect(customerDocumentsRoute).toContain('applySellerLocationScope(query, claims)');
    expect(customerDocumentsRoute).toContain('.range(offset, offset + limit - 1)');
    expect(customerDocumentsRoute).toContain("parseRowsLimit(request.nextUrl.searchParams.get('limit'), 50)");
    expect(customerDocumentsRoute).toContain('.limit(supplementalRowLimit)');
    expect(customerDocumentsRoute).toContain('.limit(itemRowLimit)');
  });
});
