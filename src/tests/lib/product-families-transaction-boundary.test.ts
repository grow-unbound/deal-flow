import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const estimatesRoute = readFileSync(join(root, 'app/api/buyer/estimates/route.ts'), 'utf8');
const mobileCart = readFileSync(join(root, 'app/(buyer)/buy/cart/page.tsx'), 'utf8');
const desktopCart = readFileSync(join(root, 'src/components/buyer/layout/BuyerDesktopCartDrawer.tsx'), 'utf8');
const cartContext = readFileSync(join(root, 'src/contexts/BuyerCartContext.tsx'), 'utf8');
const familyDetail = readFileSync(join(root, 'src/components/buyer/catalog/BuyerProductFamilyDetailClient.tsx'), 'utf8');

describe('product family transaction boundary', () => {
  it('keeps buyer estimate submission payloads SKU-only', () => {
    const estimateRequest = estimatesRoute.slice(
      estimatesRoute.indexOf('export interface EstimateRequest'),
      estimatesRoute.indexOf('export interface EstimateResponse'),
    );
    expect(estimateRequest).toContain('tenant_product_id: string');
    expect(estimateRequest).not.toContain('product_family_id');
    expect(estimateRequest).not.toContain('selected_attributes');
  });

  it('does not insert family display metadata into estimate_items', () => {
    const estimateItemsInsert = estimatesRoute.slice(
      estimatesRoute.indexOf('const estimateItemRows = acceptedItems.map'),
      estimatesRoute.indexOf("from('estimate_items').insert"),
    );
    expect(estimateItemsInsert).toContain('tenant_product_id: item.tenant_product_id');
    expect(estimateItemsInsert).not.toContain('product_family_id');
    expect(estimateItemsInsert).not.toContain('selected_attributes');
  });

  it('keeps cart line submission payloads SKU-only on mobile and desktop cart surfaces', () => {
    for (const source of [mobileCart, desktopCart]) {
      const cartLineItem = source.slice(
        source.indexOf('type CartLineItem ='),
        source.indexOf('type OrderPlaceResponse ='),
      );
      const buildLineItems = source.slice(
        source.indexOf('function buildLineItems'),
        source.indexOf('function buildAnalyticsLineItems'),
      );
      expect(cartLineItem).toContain('tenant_product_id: string');
      expect(cartLineItem).not.toContain('product_family_id');
      expect(cartLineItem).not.toContain('selected_attributes');
      expect(buildLineItems).toContain('tenant_product_id: i.tenant_product_id');
      expect(buildLineItems).not.toContain('product_family_id');
      expect(buildLineItems).not.toContain('selected_attributes');
    }
  });

  it('does not persist family metadata in cart state when family detail resolves a SKU', () => {
    const buyerCartItem = cartContext.slice(
      cartContext.indexOf('export interface BuyerCartItem'),
      cartContext.indexOf('type CartState ='),
    );
    const addItemPayload = familyDetail.slice(
      familyDetail.indexOf('addItem({'),
      familyDetail.indexOf("}, family.campaign_id ?? campaignId"),
    );
    expect(buyerCartItem).toContain('tenant_product_id: string');
    expect(buyerCartItem).not.toContain('product_family_id');
    expect(buyerCartItem).not.toContain('selected_attributes');
    expect(addItemPayload).toContain('tenant_product_id: selectedSku.tenant_product_id');
    expect(addItemPayload).not.toContain('product_family_id');
    expect(addItemPayload).not.toContain('selected_attributes');
  });
});
