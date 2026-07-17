import { DashboardOnboardingBanner } from '@/components/seller/dashboard/DashboardOnboardingBanner';
import { SellerDashboardClient } from '@/components/seller/dashboard/SellerDashboardClient';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { getSellerServerClaims, requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { isTenantCreatorUser } from '@/lib/server/tenant-creator';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import type { SellerDashboardResponse } from '@/types/seller-dashboard';

export default async function DashboardPage() {
  const tenantId = await requireSellerServerTenantId();
  const { sub: userId } = await getSellerServerClaims();
  const isTenantCreator = await isTenantCreatorUser(tenantId, userId);

  const period = DEFAULT_SELLER_LANDING_PERIOD;
  const { data: initialData, status } = await fetchSellerPageBootstrap<SellerDashboardResponse>(
    `/api/tenant/dashboard?period=${period}`,
  );

  if (status === 403) {
    return <FeatureForbiddenPage />;
  }

  return (
    <>
      <DashboardOnboardingBanner tenantId={tenantId} isTenantCreator={isTenantCreator} />
      <SellerDashboardClient initialData={initialData} initialPeriod={period} />
    </>
  );
}
