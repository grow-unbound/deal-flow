import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';
import type { CustomersLandingResponse } from '@/hooks/useCustomersLanding';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { getFlag, FLAGS } from '@/lib/flags';

async function getCustomersInitialData(period: SellerLandingPeriod): Promise<CustomersLandingResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/customers?limit=300&period=${period}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as CustomersLandingResponse;
  } catch {
    return null;
  }
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  if (!(await getFlag(FLAGS.CUSTOMER_MASTER, tenantId))) return <FeatureForbiddenPage />;

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getCustomersInitialData(period);
  return <CustomersLandingClient initialData={initialData} initialPeriod={period} />;
}
