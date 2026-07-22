import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrdersLandingClient } from '@/components/seller/sales-orders/SalesOrdersLandingClient';
import { SalesOrdersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<TenantOrdersResponse>
      path={`/api/tenant/orders?limit=200&period=${period}`}
      fallback={<SalesOrdersLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <SalesOrdersLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
      }}
    />
  );
}
