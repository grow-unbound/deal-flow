import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';
import type { CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function CatalogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<CatalogsLandingResponse>(
    `/api/tenant/catalogs?limit=200&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <CatalogsLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
}
