import { headers } from 'next/headers';
import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';
import type { TenantBrandsResponse } from '@/hooks/useBrands';

async function getBrandsInitialData(): Promise<TenantBrandsResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/brands`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as TenantBrandsResponse;
  } catch {
    return null;
  }
}

export default async function BrandsPage() {
  const initialData = await getBrandsInitialData();
  return <BrandsLandingClient initialData={initialData} />;
}
