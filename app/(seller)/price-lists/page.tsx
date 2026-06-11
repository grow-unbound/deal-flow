import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { PriceListsLandingClient } from '@/components/seller/price-lists/PriceListsLandingClient';
import type { PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { getFlag, FLAGS } from '@/lib/flags';

async function getPriceListsInitialData(): Promise<PriceListsLandingResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/price-lists`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as PriceListsLandingResponse;
  } catch {
    return null;
  }
}

export default async function PriceListsPage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  if (!(await getFlag(FLAGS.PRICING_ENGINE, tenantId))) return <FeatureForbiddenPage />;

  const initialData = await getPriceListsInitialData();
  return <PriceListsLandingClient initialData={initialData} />;
}
