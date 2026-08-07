import { DashboardOnboardingBanner } from '@/components/seller/dashboard/DashboardOnboardingBanner';
import { SellerDashboardClient } from '@/components/seller/dashboard/SellerDashboardClient';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { DashboardSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { getSellerServerClaims, requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { getTenantOnboardingBannerState } from '@/lib/server/tenant-creator';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import type { SellerDashboardMetricsV4, SellerDashboardResponse } from '@/types/seller-dashboard';

export default async function DashboardPage() {
  const tenantId = await requireSellerServerTenantId();
  const { sub: userId } = await getSellerServerClaims();
  const period = DEFAULT_SELLER_LANDING_PERIOD;
  const [bannerState, { data: initialData, status }, { data: initialMetrics }] = await Promise.all([
    getTenantOnboardingBannerState(tenantId, userId),
    fetchSellerPageBootstrap<SellerDashboardResponse>(`/api/tenant/dashboard?period=${period}`),
    fetchSellerPageBootstrap<SellerDashboardMetricsV4>(`/api/tenant/dashboard/metrics?period=${period}`),
  ]);

  if (status === 403) return <FeatureForbiddenPage />;
  if (!initialData && !initialMetrics) return <DashboardSkeleton />;

  return (
    <>
      <DashboardOnboardingBanner
        tenantId={tenantId}
        isTenantCreator={bannerState.isTenantCreator}
        dismissedAt={bannerState.onboardingBannerDismissedAt}
      />
      <SellerDashboardClient initialData={initialData} initialMetrics={initialMetrics} initialPeriod={period} />
    </>
  );
}
