'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function BrandsPage() {
  return (
    <>
      <SellerTopbar title="Brands" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="BRAND_PRODUCT_MASTER">
          <div className="px-8 py-6">
            <p className="text-cream-600">Brands module coming soon.</p>
          </div>
        </FeatureGate>
      </div>
    </>
  );
}
