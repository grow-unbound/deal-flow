import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BuyerAppLandingClient } from '@/components/seller/buyer-app/BuyerAppLandingClient';
import type { BuyerAppLandingResponse } from '@/hooks/useBuyerApp';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function BuyerAppPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<BuyerAppLandingResponse>(
    `/api/tenant/buyer-app?period=${period}`,
  );

  if (status === 403) return <FeatureForbiddenPage />;

  return <BuyerAppLandingClient initialData={initialData} initialPeriod={period} />;
}
