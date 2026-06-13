import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';
import type { CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

export default async function CatalogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<CatalogsLandingResponse>(
    `/api/tenant/catalogs?limit=200&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <CatalogsLandingClient initialData={initialData} initialPeriod={period} />;
}
