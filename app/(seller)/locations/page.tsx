import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { LocationsLandingClient } from '@/components/seller/locations/LocationsLandingClient';
import { LocationsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { LocationsLandingResponse } from '@/hooks/useLocations';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';

export default async function LocationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<LocationsLandingResponse>
      path="/api/tenant/locations/landing?period=last90&limit=50"
      fallback={<LocationsLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <RoleForbiddenPage />;
        return <LocationsLandingClient initialData={initialData} initialPeriod="last90" initialSearch={initialSearch} />;
      }}
    />
  );
}
