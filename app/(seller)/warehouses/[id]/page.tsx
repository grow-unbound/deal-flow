import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { WarehouseDetailPage } from '@/components/seller/warehouses/detail/WarehouseDetailPage';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

export default async function WarehouseDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  const { id } = await params;
  return <WarehouseDetailPage id={id} />;
}
