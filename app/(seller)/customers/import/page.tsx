'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { CsvImportFlow } from '@/components/seller/customers/CsvImportFlow';

export default function ImportCustomersPage() {
  return (
    <>
      <SellerTopbar title="Import Customers" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="CUSTOMER_MASTER">
          <div className="px-8 py-6">
            <CsvImportFlow />
          </div>
        </FeatureGate>
      </div>
    </>
  );
}
