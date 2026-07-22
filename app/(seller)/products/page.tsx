import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';
import { ProductsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { TenantProductsResponse } from '@/hooks/useProducts';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<TenantProductsResponse>
      path="/api/tenant/products?period=last90"
      fallback={<ProductsLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <ProductsLandingClient initialData={initialData} initialSearch={initialSearch} />;
      }}
    />
  );
}
