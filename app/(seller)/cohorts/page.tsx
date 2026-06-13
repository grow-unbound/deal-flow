import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CohortsLandingClient } from '@/components/seller/cohorts/CohortsLandingClient';
import type { CohortsLandingResponse } from '@/hooks/useCohorts';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

export default async function CohortsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<CohortsLandingResponse>(`/api/tenant/cohorts?period=${period}`);
  if (status === 403) return <FeatureForbiddenPage />;
  return <CohortsLandingClient initialData={initialData} initialPeriod={period} />;
}
