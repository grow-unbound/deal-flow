'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CsvImportStepper } from '@/components/seller/products/CsvImportStepper';
import { FeatureGate } from '@/components/FeatureGate';

export default function ProductImportPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Import Products" />
      <div className="mx-auto max-w-5xl">
        <FeatureGate flag="BRAND_PRODUCT_MASTER">
          <CsvImportStepper />
        </FeatureGate>
      </div>
    </div>
  );
}
