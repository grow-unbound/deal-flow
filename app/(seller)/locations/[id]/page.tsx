import { FeatureGate } from '@/components/FeatureGate';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { LocationDetailPage } from '@/components/seller/locations/detail/LocationDetailPage';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

export default async function LocationDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  const { id } = await params;
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <LocationDetailPage id={id} />
    </FeatureGate>
  );
}
