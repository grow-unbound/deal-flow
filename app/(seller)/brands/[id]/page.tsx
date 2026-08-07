import { FeatureGate } from '@/components/FeatureGate';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BrandDetailPage } from '@/components/seller/brands/detail';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

// Brands is a Growth-section module scoped to seller_admin only — the layout
// gate covers the base /brands route, but this [id] segment is directly
// URL-reachable and needs its own check.
export default async function BrandDetailsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <BrandDetailPage id={id} />
    </FeatureGate>
  );
}
