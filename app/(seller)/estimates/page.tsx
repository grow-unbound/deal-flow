import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EstimatesLandingClient } from '@/components/seller/estimates/EstimatesLandingClient';
import type { TenantEstimatesResponse } from '@/types/tenant-estimates';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { getFlag, FLAGS } from '@/lib/flags';

async function getEstimatesInitialData(period: SellerLandingPeriod): Promise<TenantEstimatesResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/estimates?limit=500&period=${period}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as TenantEstimatesResponse;
  } catch {
    return null;
  }
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const [orderMgmt, estimates] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.ESTIMATES, tenantId),
  ]);
  if (!orderMgmt || !estimates) return <FeatureForbiddenPage />;

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getEstimatesInitialData(period);
  return <EstimatesLandingClient initialData={initialData} initialPeriod={period} />;
}
