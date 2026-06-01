import { headers } from 'next/headers';
import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';
import type { CatalogsLandingResponse } from '@/hooks/useCatalogs';

async function getCatalogsInitialData(): Promise<CatalogsLandingResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/catalogs?limit=200`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as CatalogsLandingResponse;
  } catch {
    return null;
  }
}

export default async function CatalogsPage() {
  const initialData = await getCatalogsInitialData();
  return <CatalogsLandingClient initialData={initialData} />;
}
