import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CohortsLandingClient } from '@/components/seller/cohorts/CohortsLandingClient';
import type { CohortsLandingResponse } from '@/hooks/useCohorts';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function CohortsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<CohortsLandingResponse>('/api/tenant/cohorts?limit=50');
  if (status === 403) return <FeatureForbiddenPage />;
  return <CohortsLandingClient initialData={initialData} initialPeriod="last90" initialSearch={initialSearch} />;
}
