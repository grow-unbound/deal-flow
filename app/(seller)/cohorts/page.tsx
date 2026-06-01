import { headers } from 'next/headers';
import { CohortsLandingClient } from '@/components/seller/cohorts/CohortsLandingClient';
import type { CohortsLandingResponse } from '@/hooks/useCohorts';

async function getCohortsInitialData(): Promise<CohortsLandingResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/cohorts`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as CohortsLandingResponse;
  } catch {
    return null;
  }
}

export default async function CohortsPage() {
  const initialData = await getCohortsInitialData();
  return <CohortsLandingClient initialData={initialData} />;
}
