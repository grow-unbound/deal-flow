import type { ReactNode } from 'react';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { LocationsLandingClient } from '@/components/seller/locations/LocationsLandingClient';
import { LocationsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { LocationsLandingResponse } from '@/hooks/useLocations';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside LocationsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across /locations <-> /locations/[id].
export default async function LocationsLayout({ children }: { children: ReactNode }) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  return (
    <EntitySplitShell
      basePath="/locations"
      listSlot={
        <SellerBootstrapBoundary<LocationsLandingResponse>
          path="/api/tenant/locations/landing?period=last90&limit=50"
          fallback={<LocationsLandingSkeleton />}
          render={(initialData, status) => {
            if (status === 403) return <RoleForbiddenPage />;
            return <LocationsLandingClient initialData={initialData} initialPeriod="last90" />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
