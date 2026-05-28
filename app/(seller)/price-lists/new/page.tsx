'use client';

import { useRouter } from 'next/navigation';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CreatePriceListForm } from '@/components/seller/price-lists/CreatePriceListForm';
import { ROLES } from '@/constants';

export default function NewPriceListPage() {
  const router = useRouter();
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Create Price List" />
        <FeatureGate flag="PRICING_ENGINE">
          <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
            <div className="max-w-2xl">
              <CreatePriceListForm
                onSuccess={() => router.push('/price-lists')}
                onCancel={() => router.push('/price-lists')}
              />
            </div>
          </RoleGuard>
        </FeatureGate>
    </div>
  );
}
