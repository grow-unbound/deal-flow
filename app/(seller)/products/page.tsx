import { headers } from 'next/headers';
import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';
import type { TenantProductsResponse } from '@/hooks/useProducts';

async function getProductsInitialData(): Promise<TenantProductsResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/products`, {
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

export default async function ProductsPage() {
  const initialData = await getProductsInitialData();
  return <ProductsLandingClient initialData={initialData} />;
}
