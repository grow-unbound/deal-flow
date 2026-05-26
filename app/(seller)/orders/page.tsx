'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function OrdersPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Orders" subtitle="Track order intake, fulfillment, and delivery status across every buyer account." />
      <FeatureGate flag="ORDER_MANAGEMENT">
        <p className="text-cream-600">Order management module coming soon.</p>
      </FeatureGate>
      </div>
  );
}
