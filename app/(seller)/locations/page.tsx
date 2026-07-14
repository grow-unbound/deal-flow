import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { LocationsLandingClient } from '@/components/seller/locations/LocationsLandingClient';
import type { LocationsLandingResponse } from '@/hooks/useLocations';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';

export default async function LocationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<LocationsLandingResponse>(
    `/api/tenant/locations/landing?period=${period}&limit=50`,
  );
  if (status === 403) return <RoleForbiddenPage />;
  return <LocationsLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
}
