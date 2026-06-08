import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';
import type { TenantProductsResponse } from '@/hooks/useProducts';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { getFlag, FLAGS } from '@/lib/flags';

async function getProductsInitialData(period: SellerLandingPeriod): Promise<TenantProductsResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/products?period=${period}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as TenantProductsResponse;
  } catch {
    return null;
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  if (!(await getFlag(FLAGS.BRAND_PRODUCT_MASTER, tenantId))) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getProductsInitialData(period);
  return <ProductsLandingClient initialData={initialData} initialPeriod={period} />;
}
