'use client';

import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PriceListComposer } from '@/components/seller/price-lists/PriceListComposer';
import { ROLES } from '@/constants';

export default function NewPriceListPage() {
  return (
    <FeatureGate flag="PRICING_ENGINE">
      <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
        <PriceListComposer mode="create" />
      </RoleGuard>
    </FeatureGate>
  );
}
