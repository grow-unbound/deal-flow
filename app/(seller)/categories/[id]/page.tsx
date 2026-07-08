import { FeatureGate } from '@/components/FeatureGate';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CategoryDetailPage } from '@/components/seller/categories/detail/CategoryDetailPage';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

export default async function CategoryDetailRoutePage({
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
      <CategoryDetailPage id={id} />
    </FeatureGate>
  );
}
