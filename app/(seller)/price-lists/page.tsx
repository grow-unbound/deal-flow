'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ROLES } from '@/constants';

export default function PriceListsPage() {
  return (
    <>
      <SellerTopbar title="Price Lists" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="PRICING_ENGINE">
          <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
            <div className="px-8 py-6">
              <p className="text-cream-600">Pricing engine module coming soon.</p>
            </div>
          </RoleGuard>
        </FeatureGate>
      </div>
    </>
  );
}
