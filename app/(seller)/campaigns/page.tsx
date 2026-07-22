import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';
import { CatalogsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function CatalogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<CatalogsLandingResponse>
      path="/api/tenant/catalogs?limit=50"
      fallback={<CatalogsLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <CatalogsLandingClient initialData={initialData} initialPeriod="last90" initialSearch={initialSearch} />;
      }}
    />
  );
}
