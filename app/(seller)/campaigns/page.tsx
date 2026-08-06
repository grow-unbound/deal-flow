import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';
import { CatalogsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import type { CatalogsLandingMetricsV4, CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function CatalogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const [{ data: initialData, status }, { data: initialMetrics }] = await Promise.all([
    fetchSellerPageBootstrap<CatalogsLandingResponse>('/api/tenant/catalogs?limit=50'),
    fetchSellerPageBootstrap<CatalogsLandingMetricsV4>('/api/tenant/catalogs/metrics'),
  ]);

  if (status === 403) return <FeatureForbiddenPage />;
  if (!initialData && !initialMetrics) return <CatalogsLandingSkeleton />;

  return (
    <CatalogsLandingClient
      initialData={initialData}
      initialMetrics={initialMetrics}
      initialPeriod="last90"
      initialSearch={initialSearch}
    />
  );
}
