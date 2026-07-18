import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(`${root}/supabase/migrations/20260714103145_worker_f_detail_tab_authoritative_search.sql`, 'utf8');

describe('Worker F detail search contracts', () => {
  it('scopes inventory and KPI aggregation before materialization', () => {
    expect(migration).not.toMatch(/tenant_inventory\s+i\s+where\s+i\.tenant_id/i);
    expect(migration).toContain('inventory_product.tenant_brand_id = p_brand_id');
    expect(migration).toContain('metric_product.tenant_brand_id = p_brand_id');
    expect(migration).toContain('inventory_item.campaign_id=p_catalog_id');
    expect(migration).toContain("coalesce(nullif(tc.name, ''), cc.name, 'Uncategorized')");
    expect(migration).not.toContain('tc.name_override');
  });

  it('keeps every RPC bounded and service-role only', () => {
    expect(migration.match(/limit least\(greatest\(coalesce\(p_limit/gi)).toHaveLength(5);
    expect(migration.match(/revoke all on function app\.search_[^(]+\([^;]+from public,anon,authenticated;/g)).toHaveLength(5);
    expect(migration.match(/grant execute on function app\.search_[^(]+\([^;]+to service_role;/g)).toHaveLength(5);
  });

  it('routes all five tabs through dedicated bounded APIs', () => {
    const hook = readFileSync(`${root}/src/hooks/useDetailTabSearch.ts`, 'utf8');
    expect(hook).toContain('/api/tenant/brands/${id}/products');
    expect(hook).toContain('/api/tenant/brands/${id}/catalogs');
    expect(hook).toContain('/api/tenant/catalogs/${id}/products');
    expect(hook).toContain('/api/cohorts/${id}/buyers');
    expect(hook).toContain('/api/price-lists/${id}/products');
    expect(hook).toContain("params = new URLSearchParams({ limit: '50'");
  });
});
