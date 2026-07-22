import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { PriceListsLandingClient } from '@/components/seller/price-lists/PriceListsLandingClient';
import { PriceListsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function PriceListsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<PriceListsLandingResponse>
      path="/api/price-lists?limit=50"
      fallback={<PriceListsLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <PriceListsLandingClient initialData={initialData} initialSearch={initialSearch} />;
      }}
    />
  );
}
