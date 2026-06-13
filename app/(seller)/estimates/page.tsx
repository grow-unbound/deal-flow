import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EstimatesLandingClient } from '@/components/seller/estimates/EstimatesLandingClient';
import type { TenantEstimatesResponse } from '@/types/tenant-estimates';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantEstimatesResponse>(
    `/api/tenant/estimates?limit=500&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <EstimatesLandingClient initialData={initialData} initialPeriod={period} />;
}
