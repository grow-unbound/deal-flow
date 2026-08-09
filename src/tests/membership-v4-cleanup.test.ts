import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('membership v4 cleanup', () => {
  it('keeps active membership UI and API off legacy 90-day filters', () => {
    const activeSurface = [
      'src/components/seller/shared/MembershipFilterPanel.tsx',
      'src/components/seller/cohorts/detail/CohortBuyersTab.tsx',
      'src/components/seller/catalogs/detail/CatalogBuyersTab.tsx',
      'src/components/seller/catalogs/CatalogComposer.tsx',
      'src/components/seller/price-lists/PriceListComposer.tsx',
      'app/api/cohorts/[id]/buyers/route.ts',
      'app/api/tenant/catalogs/[id]/buyers/route.ts',
    ].map(read).join('\n');

    expect(activeSurface).not.toMatch(/sales_90d|last_sale|last_ordered_bucket|gmv_90d_bucket/i);
    expect(activeSurface).not.toMatch(/Last 90d|Sales 90d|90 days|GMV .*90/i);
    expect(activeSurface).toContain('invoice_this_quarter');
    expect(activeSurface).toContain('demand_this_quarter');
  });

  it('adds candidate dirty work and uses v4/current-quarter primitives', () => {
    const migration = read('supabase/migrations/20260809113501_realtime_membership_v4_cleanup.sql');

    expect(migration).toContain('buyer_candidate');
    expect(migration).toContain('product_candidate');
    expect(migration).toContain("metrics_v4_period_bounds('this_quarter'");
    expect(migration).toContain('metrics_buyer_period_summary');
    expect(migration).toContain('membership_product_sold_this_quarter');
    expect(migration).not.toContain('metrics_v2_primary_demand_kind');
    expect(migration).not.toContain('metrics_buyer_snapshot');
  });

  it('keeps product preview counts scoped to active products only', () => {
    const migration = read('supabase/migrations/20260809113501_realtime_membership_v4_cleanup.sql');
    const hotfix = read('supabase/migrations/20260809122915_fix_product_preview_active_counts.sql');
    const previewProductFunction = migration.match(/CREATE OR REPLACE FUNCTION app\.preview_product_membership_count[\s\S]*?END;\n\$\$;/)?.[0] ?? '';

    expect(previewProductFunction).toContain('tp.deleted_at IS NULL');
    expect(previewProductFunction).toContain('COALESCE(tp.is_active, true)');
    expect(hotfix).toContain('COALESCE(tp.is_active, true)');
  });

  it('does not persist full product id lists for dynamic campaign composer saves', () => {
    const createRoute = read('app/api/tenant/catalogs/route.ts');
    const editRoute = read('app/api/tenant/catalogs/[id]/route.ts');
    const composer = read('src/components/seller/catalogs/CatalogComposer.tsx');

    expect(createRoute).toContain('!payload.is_dynamic && payload.items.length > 0');
    expect(editRoute).toContain('!payload.is_dynamic && payload.items.length > 0');
    expect(composer).toContain('items: isDynamic');
    expect(composer).toContain('!payload.is_dynamic && payload.items.length === 0');
  });
});
