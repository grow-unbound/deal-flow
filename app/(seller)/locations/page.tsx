import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { LocationsLandingClient } from '@/components/seller/locations/LocationsLandingClient';
import type { LocationsLandingResponse } from '@/hooks/useLocations';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function LocationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<LocationsLandingResponse>(
    `/api/tenant/locations/landing?period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <LocationsLandingClient initialData={initialData} initialPeriod={period} />;
}
