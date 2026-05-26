'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { CsvImportFlow } from '@/components/seller/customers/CsvImportFlow';

export default function ImportCustomersPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Import Customers" />
      <FeatureGate flag="CUSTOMER_MASTER">
        <CsvImportFlow />
      </FeatureGate>
      </div>
  );
}
