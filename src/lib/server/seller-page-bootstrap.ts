import { headers } from 'next/headers';

export async function fetchSellerPageBootstrap<T>(path: string): Promise<{ data: T | null; status: number | null }> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) {
    return { data: null, status: null };
  }

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}${path}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) {
      return { data: null, status: response.status };
    }

    return {
      data: (await response.json()) as T,
      status: response.status,
    };
  } catch {
    return { data: null, status: null };
  }
}
