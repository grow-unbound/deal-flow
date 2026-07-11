import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrdersLandingClient } from '@/components/seller/sales-orders/SalesOrdersLandingClient';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantOrdersResponse>(
    `/api/tenant/orders?limit=200&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <SalesOrdersLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
}
