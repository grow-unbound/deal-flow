import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrdersLandingClient } from '@/components/seller/sales-orders/SalesOrdersLandingClient';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { getFlag, FLAGS } from '@/lib/flags';

async function getSalesOrdersInitialData(period: SellerLandingPeriod): Promise<TenantOrdersResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/orders?limit=200&period=${period}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as TenantOrdersResponse;
  } catch {
    return null;
  }
}

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const [orderMgmt, salesOrders] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.SALES_ORDERS, tenantId),
  ]);
  if (!orderMgmt || !salesOrders) return <FeatureForbiddenPage />;

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getSalesOrdersInitialData(period);
  return <SalesOrdersLandingClient initialData={initialData} initialPeriod={period} />;
}
