'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function BuyersPage() {
  return (
    <>
      <SellerTopbar title="Customers" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="CUSTOMER_MASTER">
          <div className="px-8 py-6">
            <p className="text-cream-600">Customer master module coming soon.</p>
          </div>
        </FeatureGate>
      </div>
    </>
  );
}
