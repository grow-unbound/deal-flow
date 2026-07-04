import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { WarehousesLandingClient } from '@/components/seller/warehouses/WarehousesLandingClient';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  return <WarehousesLandingClient />;
}
