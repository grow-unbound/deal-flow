import type { ReactNode } from 'react';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { WarehousesLandingClient } from '@/components/seller/warehouses/WarehousesLandingClient';
import { WarehousesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { WarehousesLandingResponse } from '@/types/tenant-warehouses';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside WarehousesLandingClient
// via useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams`
// from Next.js, and the list now lives here so it can stay mounted across
// /warehouses <-> /warehouses/[id].
export default async function WarehousesLayout({ children }: { children: ReactNode }) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  return (
    <EntitySplitShell
      basePath="/warehouses"
      listSlot={
        <SellerBootstrapBoundary<WarehousesLandingResponse>
          path="/api/tenant/warehouses/landing?period=today&limit=50"
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/warehouses"
              ariaLabel="Loading warehouses"
              expandedFallback={<WarehousesLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <RoleForbiddenPage />;
            return <WarehousesLandingClient initialData={initialData} initialPeriod="today" />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
