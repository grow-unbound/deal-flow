import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';
import type { TenantBrandsResponse } from '@/hooks/useBrands';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { getFlag, FLAGS } from '@/lib/flags';

async function getBrandsInitialData(period: SellerLandingPeriod): Promise<TenantBrandsResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}/api/tenant/brands?period=${period}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as TenantBrandsResponse;
  } catch {
    return null;
  }
}

export default async function BrandsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  if (!(await getFlag(FLAGS.BRAND_PRODUCT_MASTER, tenantId))) return <FeatureForbiddenPage />;

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialData = await getBrandsInitialData(period);
  return <BrandsLandingClient initialData={initialData} initialPeriod={period} />;
}
