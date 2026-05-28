'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function BuyersPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Customers" subtitle="Manage buyer organizations, relationships, and account access from one place." />
      <FeatureGate flag="CUSTOMER_MASTER">
        <p className="text-cream-600">Customer master module coming soon.</p>
      </FeatureGate>
      </div>
  );
}
