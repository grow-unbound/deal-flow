import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';
import type { TenantProductsResponse } from '@/hooks/useProducts';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantProductsResponse>('/api/tenant/products?period=last90');
  if (status === 403) return <FeatureForbiddenPage />;
  return <ProductsLandingClient initialData={initialData} initialSearch={initialSearch} />;
}
