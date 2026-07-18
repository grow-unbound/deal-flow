import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const detailRouteContracts = [
  {
    file: 'app/api/tenant/customers/[id]/route.ts',
    rpc: 'get_seller_customer_detail_v2',
  },
  {
    file: 'app/api/tenant/products/[id]/route.ts',
    rpc: 'get_seller_product_detail_v2',
  },
  {
    file: 'app/api/tenant/brands/[id]/route.ts',
    rpc: 'get_seller_brand_detail_v2',
  },
  {
    file: 'app/api/tenant/categories/[id]/route.ts',
    rpc: 'get_seller_category_detail_v2',
  },
  {
    file: 'app/api/tenant/locations/[id]/detail/route.ts',
    rpc: 'get_seller_location_detail_v2',
  },
  {
    file: 'src/lib/server/warehouse-data.ts',
    rpc: 'get_seller_warehouse_detail_v2',
  },
  {
    file: 'app/api/cohorts/[id]/route.ts',
    rpc: 'get_seller_cohort_detail_v2',
  },
  {
    file: 'app/api/price-lists/[id]/route.ts',
    rpc: 'get_seller_pricelist_detail_v2',
  },
  {
    file: 'app/api/tenant/catalogs/[id]/route.ts',
    rpc: 'get_seller_campaign_detail_v2',
  },
];

const detailPageConsumptionFiles = [
  'app/(seller)/customers/[id]/page.tsx',
  'src/components/seller/products/detail/ProductDetailPage.tsx',
  'src/components/seller/brands/detail/BrandDetailPage.tsx',
  'src/components/seller/categories/detail/CategoryDetailPage.tsx',
  'src/components/seller/locations/detail/LocationDetailPage.tsx',
  'src/components/seller/warehouses/detail/WarehouseDetailPage.tsx',
  'src/components/seller/cohorts/detail/CohortDetailPage.tsx',
  'src/components/seller/catalogs/detail/CatalogDetailPage.tsx',
  'app/(seller)/price-lists/[id]/page.tsx',
];

const legacyV1SourcePattern =
  /\b(?:buyers_snapshot|locations_snapshot|products_snapshot|brands_snapshot|categories_snapshot|warehouses_snapshot|kpi_[a-z_]+_daily)\b/i;

describe('Metrics V2 Phase 7 detail route cutover', () => {
  it('routes every analytic seller detail family through its V2 bootstrap RPC', () => {
    for (const contract of detailRouteContracts) {
      const source = fs.readFileSync(path.resolve(process.cwd(), contract.file), 'utf8');

      expect(source, contract.file).toContain(contract.rpc);
      expect(source, contract.file).toContain('performance_cards');
    }
  });

  it('keeps selected analytic detail paths free of legacy V1 snapshot and daily sources', () => {
    for (const contract of detailRouteContracts) {
      const source = fs.readFileSync(path.resolve(process.cwd(), contract.file), 'utf8');

      expect(source, contract.file).not.toMatch(legacyV1SourcePattern);
    }
  });

  it('passes the normalized performance card payload into every selected detail performance surface', () => {
    for (const file of detailPageConsumptionFiles) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

      expect(source, file).toContain('performance_cards');
    }
  });
});
