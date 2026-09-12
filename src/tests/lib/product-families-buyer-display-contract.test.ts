import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const catalogRoute = readFileSync(join(root, 'app/api/buyer/catalog/route.ts'), 'utf8');
const productCard = readFileSync(join(root, 'src/components/buyer/catalog/ProductCard.tsx'), 'utf8');
const familyDetail = readFileSync(join(root, 'src/components/buyer/catalog/BuyerProductFamilyDetailClient.tsx'), 'utf8');
const storefrontPaths = readFileSync(join(root, 'src/lib/storefront-paths.ts'), 'utf8');

describe('product family buyer display contract', () => {
  it('routes grouped catalog browse through the family-scoped loader', () => {
    expect(catalogRoute).toContain("context.publicCatalog?.productDisplayMode === 'group_variants'");
    expect(catalogRoute).toContain('fetchBuyerFamilyCatalogPage');
    expect(catalogRoute).toContain('!tenantProductId');
    expect(catalogRoute).toContain('!requestedCampaignId');
  });

  it('opens family cards as option selectors instead of quick-adding representative SKUs', () => {
    expect(productCard).toContain("const isFamilyCard = item.item_type === 'family'");
    expect(productCard).toContain('STOREFRONT.family(familyId)');
    expect(productCard).toContain('OPTIONS');
    expect(productCard).toContain('if (isFamilyCard) return;');
  });

  it('adds only the resolved SKU from family detail', () => {
    const addItemPayload = familyDetail.slice(
      familyDetail.indexOf('addItem({'),
      familyDetail.indexOf("}, family.campaign_id ?? campaignId"),
    );
    expect(addItemPayload).toContain('tenant_product_id: selectedSku.tenant_product_id');
    expect(addItemPayload).toContain('internal_sku: selectedSku.internal_sku');
    expect(addItemPayload).not.toContain('family.id');
    expect(addItemPayload).not.toContain('selection');
  });

  it('exposes public family storefront routes and guest catalog API access', () => {
    expect(storefrontPaths).toContain('family: (id: string) => `/family/${id}`');
    expect(storefrontPaths).toContain("['/family/', '/buy/family/']");
    expect(storefrontPaths).toContain("pathname.startsWith('/api/buyer/product-families/')");
  });
});
