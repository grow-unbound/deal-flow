import { headers } from 'next/headers';
import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';
import type { CustomersLandingResponse } from '@/hooks/useCustomersLanding';

async function getCustomersInitialData(): Promise<CustomersLandingResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/customers?limit=300`, {
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

export default async function CustomersPage() {
  const initialData = await getCustomersInitialData();
  return <CustomersLandingClient initialData={initialData} />;
}
