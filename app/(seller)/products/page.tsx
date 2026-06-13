import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';
import type { TenantProductsResponse } from '@/hooks/useProducts';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantProductsResponse>(`/api/tenant/products?period=${period}`);
  if (status === 403) return <FeatureForbiddenPage />;
  return <ProductsLandingClient initialData={initialData} initialPeriod={period} />;
}
