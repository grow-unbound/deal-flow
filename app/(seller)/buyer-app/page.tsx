import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BuyerAppLandingClient } from '@/components/seller/buyer-app/BuyerAppLandingClient';
import type { BuyerAppLandingMetricsV4, BuyerAppLandingResponse } from '@/hooks/useBuyerApp';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';

export default async function BuyerAppPage() {
  await requireSellerServerTenantId();

  const period = DEFAULT_SELLER_LANDING_PERIOD;
  const [{ data: initialData, status }, { data: initialMetrics }] = await Promise.all([
    fetchSellerPageBootstrap<BuyerAppLandingResponse>(`/api/tenant/buyer-app?period=${period}`),
    fetchSellerPageBootstrap<BuyerAppLandingMetricsV4>('/api/tenant/buyer-app/metrics'),
  ]);

  if (status === 403) return <FeatureForbiddenPage />;

  return <BuyerAppLandingClient initialData={initialData} initialMetrics={initialMetrics} initialPeriod={period} />;
}
