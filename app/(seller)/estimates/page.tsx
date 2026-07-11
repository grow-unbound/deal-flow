import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EstimatesLandingClient } from '@/components/seller/estimates/EstimatesLandingClient';
import type { TenantEstimatesResponse } from '@/types/tenant-estimates';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantEstimatesResponse>(
    `/api/tenant/estimates?limit=500&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <EstimatesLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
}
