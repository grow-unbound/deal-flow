import { DashboardOnboardingBanner } from '@/components/seller/dashboard/DashboardOnboardingBanner';
import { SellerDashboardClient } from '@/components/seller/dashboard/SellerDashboardClient';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { DashboardSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { getSellerServerClaims, requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { isTenantCreatorUser } from '@/lib/server/tenant-creator';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import type { SellerDashboardResponse } from '@/types/seller-dashboard';

export default async function DashboardPage() {
  const tenantId = await requireSellerServerTenantId();
  const { sub: userId } = await getSellerServerClaims();
  const isTenantCreator = await isTenantCreatorUser(tenantId, userId);
  const period = DEFAULT_SELLER_LANDING_PERIOD;

  return (
    <SellerBootstrapBoundary<SellerDashboardResponse>
      path={`/api/tenant/dashboard?period=${period}`}
      fallback={<DashboardSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return (
          <>
            <DashboardOnboardingBanner tenantId={tenantId} isTenantCreator={isTenantCreator} />
            <SellerDashboardClient initialData={initialData} initialPeriod={period} />
          </>
        );
      }}
    />
  );
}
