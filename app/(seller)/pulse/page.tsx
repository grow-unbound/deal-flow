import { Suspense } from 'react';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { SellerDashboardClient } from '@/components/seller/dashboard/SellerDashboardClient';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { DashboardSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type { BuyerAppLandingMetricsV4 } from '@/hooks/useBuyerApp';
import type { SellerDashboardMetricsV4, SellerDashboardResponse } from '@/types/seller-dashboard';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.dashboard);

async function PulseBody({ period }: { period: SellerLandingPeriod }) {
  const [{ data: initialData, status }, { data: initialMetrics }, { data: initialBuyerAppMetrics }] = await Promise.all([
    fetchSellerPageBootstrap<SellerDashboardResponse>(`/api/tenant/dashboard?period=${period}`),
    fetchSellerPageBootstrap<SellerDashboardMetricsV4>(`/api/tenant/dashboard/metrics?period=${period}`),
    fetchSellerPageBootstrap<BuyerAppLandingMetricsV4>('/api/tenant/buyer-app/metrics'),
  ]);

  if (status === 403) return <FeatureForbiddenPage />;
  if (!initialData && !initialMetrics) return <DashboardSkeleton />;

  return <SellerDashboardClient initialData={initialData} initialMetrics={initialMetrics} initialBuyerAppMetrics={initialBuyerAppMetrics} initialPeriod={period} />;
}

export default async function PulsePage() {
  await requireSellerServerTenantId();
  const period = DEFAULT_SELLER_LANDING_PERIOD;

  return (
    <>
      <Suspense fallback={<DashboardSkeleton />}>
        <PulseBody period={period} />
      </Suspense>
    </>
  );
}
