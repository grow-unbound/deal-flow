import { headers } from 'next/headers';
import { OrdersLandingClient } from '@/components/seller/orders/OrdersLandingClient';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';

async function getOrdersInitialData(period: SellerLandingPeriod): Promise<TenantOrdersResponse | null> {
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getOrdersInitialData(period);
  return <OrdersLandingClient initialData={initialData} initialPeriod={period} />;
}
