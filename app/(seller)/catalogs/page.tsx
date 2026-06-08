import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';
import type { CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { getFlag, FLAGS } from '@/lib/flags';

async function getCatalogsInitialData(period: SellerLandingPeriod): Promise<CatalogsLandingResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/catalogs?limit=200&period=${period}`, {
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

export default async function CatalogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  if (!(await getFlag(FLAGS.CATALOG_PUBLISHING, tenantId))) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getCatalogsInitialData(period);
  return <CatalogsLandingClient initialData={initialData} initialPeriod={period} />;
}
