'use client';

import { useParams } from 'next/navigation';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PriceListComposer } from '@/components/seller/price-lists/PriceListComposer';
import { ROLES } from '@/constants';

export default function EditPriceListPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <FeatureGate flag="PRICING_ENGINE">
      <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
        <PriceListComposer mode="edit" priceListId={id} />
      </RoleGuard>
    </FeatureGate>
  );
}
