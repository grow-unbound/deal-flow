import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CohortsLandingClient } from '@/components/seller/cohorts/CohortsLandingClient';
import { CohortsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { CohortsLandingResponse } from '@/hooks/useCohorts';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function CohortsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<CohortsLandingResponse>
      path="/api/tenant/cohorts?limit=50"
      fallback={<CohortsLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <CohortsLandingClient initialData={initialData} initialPeriod="last90" initialSearch={initialSearch} />;
      }}
    />
  );
}
