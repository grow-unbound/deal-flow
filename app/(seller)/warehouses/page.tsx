import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { WarehousesLandingClient } from '@/components/seller/warehouses/WarehousesLandingClient';
import type { WarehousesLandingResponse } from '@/types/tenant-warehouses';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
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
  const { data: initialData, status } = await fetchSellerPageBootstrap<WarehousesLandingResponse>(
    '/api/tenant/warehouses/landing?period=today&limit=50',
  );
  if (status === 403) return <RoleForbiddenPage />;

  return <WarehousesLandingClient initialData={initialData} initialPeriod="today" initialSearch={initialSearch} />;
}
