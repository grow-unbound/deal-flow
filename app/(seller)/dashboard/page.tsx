import { Suspense } from 'react';
import { DashboardOnboardingBanner } from '@/components/seller/dashboard/DashboardOnboardingBanner';
import { SellerDashboardClient } from '@/components/seller/dashboard/SellerDashboardClient';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { DashboardSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { getSellerServerClaims, requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { getTenantOnboardingBannerState } from '@/lib/server/tenant-creator';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type { SellerDashboardMetricsV4, SellerDashboardResponse } from '@/types/seller-dashboard';

// Split into two independent Suspense boundaries so the page shell can
// stream before either resolves, and the (typically fast) banner doesn't
// wait on the (typically slower) dashboard bootstrap calls or vice versa.
async function DashboardBanner({ tenantId, userId }: { tenantId: string; userId: string | null | undefined }) {
  const bannerState = await getTenantOnboardingBannerState(tenantId, userId);
  return (
    <DashboardOnboardingBanner
      tenantId={tenantId}
      isTenantCreator={bannerState.isTenantCreator}
      dismissedAt={bannerState.onboardingBannerDismissedAt}
    />
  );
}

async function DashboardBody({ period }: { period: SellerLandingPeriod }) {
  const [{ data: initialData, status }, { data: initialMetrics }] = await Promise.all([
    fetchSellerPageBootstrap<SellerDashboardResponse>(`/api/tenant/dashboard?period=${period}`),
    fetchSellerPageBootstrap<SellerDashboardMetricsV4>(`/api/tenant/dashboard/metrics?period=${period}`),
  ]);

  if (status === 403) return <FeatureForbiddenPage />;
  if (!initialData && !initialMetrics) return <DashboardSkeleton />;

  return <SellerDashboardClient initialData={initialData} initialMetrics={initialMetrics} initialPeriod={period} />;
}

export default async function DashboardPage() {
  const tenantId = await requireSellerServerTenantId();
  const { sub: userId } = await getSellerServerClaims();
  const period = DEFAULT_SELLER_LANDING_PERIOD;

  return (
    <>
      <Suspense fallback={null}>
        <DashboardBanner tenantId={tenantId} userId={userId} />
      </Suspense>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody period={period} />
      </Suspense>
    </>
  );
}
