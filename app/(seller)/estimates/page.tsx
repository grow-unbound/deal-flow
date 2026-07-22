import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EstimatesLandingClient } from '@/components/seller/estimates/EstimatesLandingClient';
import { EstimatesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { TenantEstimatesResponse } from '@/types/tenant-estimates';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<TenantEstimatesResponse>
      path={`/api/tenant/estimates?limit=500&period=${period}`}
      fallback={<EstimatesLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <EstimatesLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
      }}
    />
  );
}
