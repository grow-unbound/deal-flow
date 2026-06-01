import { headers } from 'next/headers';
import { OrdersLandingClient } from '@/components/seller/orders/OrdersLandingClient';
import type { TenantOrdersResponse } from '@/hooks/useOrders';

async function getOrdersInitialData(): Promise<TenantOrdersResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/orders?limit=200`, {
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

export default async function OrdersPage() {
  const initialData = await getOrdersInitialData();
  return <OrdersLandingClient initialData={initialData} />;
}
