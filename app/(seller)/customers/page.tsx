import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';
import { CustomersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { CustomersLandingResponse } from '@/hooks/useCustomersLanding';
import { PAGE_SIZE } from '@/lib/pagination';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<CustomersLandingResponse>
      // Only `.kpis`/`.callouts` from this response are consumed on first paint (both
      // computed server-side from unbounded queries, independent of this limit) — the
      // `.buyers` row array itself is discarded and refetched by a separate cursor-paginated
      // query (useCustomersLandingInfinite). Keep this limit small; it's pure serialization cost.
      path={`/api/tenant/customers?limit=${PAGE_SIZE.SELLER}&period=last90`}
      fallback={<CustomersLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <CustomersLandingClient initialData={initialData} initialSearch={initialSearch} />;
      }}
    />
  );
}
