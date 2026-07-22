import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CategoriesLandingClient } from '@/components/seller/categories/CategoriesLandingClient';
import { CategoriesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import type { CategoriesLandingResponse } from '@/hooks/useCategories';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<CategoriesLandingResponse>
      path="/api/tenant/categories/landing?period=last90&limit=50"
      fallback={<CategoriesLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <RoleForbiddenPage />;
        return <CategoriesLandingClient initialData={initialData} initialPeriod="last90" initialSearch={initialSearch} />;
      }}
    />
  );
}
