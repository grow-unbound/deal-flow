import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { WarehousesLandingClient } from '@/components/seller/warehouses/WarehousesLandingClient';
import { WarehousesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { WarehousesLandingResponse } from '@/types/tenant-warehouses';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<WarehousesLandingResponse>
      path="/api/tenant/warehouses/landing?period=today&limit=50"
      fallback={<WarehousesLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <RoleForbiddenPage />;
        return <WarehousesLandingClient initialData={initialData} initialPeriod="today" initialSearch={initialSearch} />;
      }}
    />
  );
}
