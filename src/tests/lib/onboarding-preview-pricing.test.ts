import { describe, expect, it } from 'vitest';
import {
  applyOnboardingPreviewPrices,
  assignedPricesFromPreviewItems,
  needsAssignedPriceFetch,
} from '@/lib/onboarding/preview-pricing';
import type { BuyerCatalogItem } from '@/types/buyer';

function item(partial: Partial<BuyerCatalogItem> & Pick<BuyerCatalogItem, 'tenant_product_id'>): BuyerCatalogItem {
  return {
    id: partial.tenant_product_id,
    campaign_id: null,
    campaign_name: null,
    campaign_valid_until: null,
    internal_sku: 'SKU',
    display_name: 'Cam',
    brand_id: null,
    brand_name: null,
    category_id: null,
    category_name: null,
    mrp: 100,
    price: 80,
    resolved_price: 80,
    default_uom: 'pcs',
    pack_size: 1,
    image_urls: [],
    stock_status: 'available',
    on_hand: 0,
    ...partial,
  };
}

describe('onboarding preview pricing overlay', () => {
  it('keeps catalog prices when hiding until login so base rates stay in memory', () => {
    const items = [item({ tenant_product_id: 'p1', price: 80, resolved_price: 80 })];
    expect(applyOnboardingPreviewPrices(items, 'hidden_until_login', null)[0]?.price).toBe(80);
    expect(needsAssignedPriceFetch('hidden_until_login', 'list-1', {})).toBe(false);
    expect(needsAssignedPriceFetch('base_selling_rate', '', {})).toBe(false);
  });

  it('restores base selling rate from resolved_price after an assigned overlay', () => {
    const items = [item({ tenant_product_id: 'p1', price: 55, resolved_price: 80 })];
    expect(applyOnboardingPreviewPrices(items, 'base_selling_rate', null)[0]?.price).toBe(80);
  });

  it('nulls prices until an assigned list cache exists', () => {
    const items = [item({ tenant_product_id: 'p1', price: 80, resolved_price: 80 })];
    expect(applyOnboardingPreviewPrices(items, 'assigned_price_list', null)[0]?.price).toBeNull();
    expect(needsAssignedPriceFetch('assigned_price_list', 'list-1', {})).toBe(true);
    const cached = assignedPricesFromPreviewItems([item({ tenant_product_id: 'p1', price: 55 })]);
    expect(applyOnboardingPreviewPrices(items, 'assigned_price_list', cached)[0]?.price).toBe(55);
    expect(needsAssignedPriceFetch('assigned_price_list', 'list-1', { 'list-1': cached })).toBe(false);
  });
});
