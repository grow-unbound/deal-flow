'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CsvImportStepper } from '@/components/seller/products/CsvImportStepper';
import { FeatureGate } from '@/components/FeatureGate';

export default function ProductImportPage() {
  return (
    <>
      <SellerTopbar title="Import Products" />
      <div
        className="px-8 max-w-5xl mx-auto"
        style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}
      >
        <FeatureGate flag="BRAND_PRODUCT_MASTER">
          <CsvImportStepper />
        </FeatureGate>
      </div>
    </>
  );
}
