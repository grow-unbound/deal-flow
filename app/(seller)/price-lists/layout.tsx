import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { PriceListsLandingClient } from '@/components/seller/price-lists/PriceListsLandingClient';
import { PriceListsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside PriceListsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across /price-lists <-> /price-lists/[id].
export default async function PriceListsLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/price-lists"
      listSlot={
        <SellerBootstrapBoundary<PriceListsLandingResponse>
          path="/api/price-lists?limit=50"
          fallback={<PriceListsLandingSkeleton />}
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <PriceListsLandingClient initialData={initialData} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
