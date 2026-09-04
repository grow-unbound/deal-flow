import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn(() => ({ rpc: vi.fn(), from: vi.fn() })) },
}));

import { guestUnitPrice, TENANT_PRODUCT_PUBLIC_SELECT } from '@/lib/server/public-catalog';

const buyerProductData = readFileSync(
  resolve('src/lib/server/buyer-product-data.ts'),
  'utf8',
);
const publicCatalog = readFileSync(
  resolve('src/lib/server/public-catalog.ts'),
  'utf8',
);
const onboardingPreview = readFileSync(
  resolve('src/lib/server/onboarding-catalog-preview.ts'),
  'utf8',
);

describe('public catalog product select', () => {
  it('never selects cost_price for guest/public hydrate', () => {
    expect(TENANT_PRODUCT_PUBLIC_SELECT).not.toMatch(/cost_price/);
    expect(buyerProductData).toContain('TENANT_PRODUCT_PUBLIC_SELECT');
    expect(TENANT_PRODUCT_PUBLIC_SELECT).toContain('base_selling_price');
    expect(TENANT_PRODUCT_PUBLIC_SELECT).toContain('internal_sku');
    expect(onboardingPreview).toContain('TENANT_PRODUCT_PUBLIC_SELECT');
    expect(onboardingPreview).toContain('metrics_tenant_now_summary');
    expect(onboardingPreview).toContain('active_product_count');
    expect(onboardingPreview).not.toContain('cost_price');
  });

  it('hides unit price until login and never falls back to cost', () => {
    expect(guestUnitPrice({
      mode: 'hidden_until_login',
      assignedPrice: 99,
      baseSellingPrice: 120,
    })).toBeNull();
    expect(guestUnitPrice({
      mode: 'base_selling_rate',
      assignedPrice: 99,
      baseSellingPrice: 120,
    })).toBe(120);
    expect(guestUnitPrice({
      mode: 'assigned_price_list',
      assignedPrice: 88,
      baseSellingPrice: 120,
    })).toBe(88);
    expect(guestUnitPrice({
      mode: 'assigned_price_list',
      assignedPrice: null,
      baseSellingPrice: 120,
    })).toBeNull();
  });

  it('scopes assigned list prices through price_lists, not price_list_items.tenant_id', () => {
    const assignedLoader = publicCatalog.slice(
      publicCatalog.indexOf('export async function loadAssignedPriceListPrices'),
      publicCatalog.indexOf('export function guestUnitPrice'),
    );
    expect(assignedLoader).toContain(".from('price_lists')");
    expect(assignedLoader).toContain(".from('price_list_items')");
    expect(assignedLoader).not.toMatch(/from\('price_list_items'\)[\s\S]*eq\('tenant_id'/);
  });
});
