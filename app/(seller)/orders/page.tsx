'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function OrdersPage() {
  return (
    <>
      <SellerTopbar title="Orders" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="ORDER_MANAGEMENT">
          <div className="px-8 py-6">
            <p className="text-cream-600">Order management module coming soon.</p>
          </div>
        </FeatureGate>
      </div>
    </>
  );
}
