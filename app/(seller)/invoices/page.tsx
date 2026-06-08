import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { InvoicesLandingClient } from '@/components/seller/invoices/InvoicesLandingClient';
import type { TenantInvoicesResponse } from '@/hooks/useInvoices';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { getFlag, FLAGS } from '@/lib/flags';

async function getInvoicesInitialData(period: SellerLandingPeriod): Promise<TenantInvoicesResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/invoices?limit=200&period=${period}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as TenantInvoicesResponse;
  } catch {
    return null;
  }
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const [orderMgmt, invoices] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.INVOICES, tenantId),
  ]);
  if (!orderMgmt || !invoices) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getInvoicesInitialData(period);
  return <InvoicesLandingClient initialData={initialData} initialPeriod={period} />;
}
