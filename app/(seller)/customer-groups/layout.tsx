import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CohortsLandingClient } from '@/components/seller/cohorts/CohortsLandingClient';
import { CohortsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { CohortsLandingResponse } from '@/hooks/useCohorts';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside CohortsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across
// /customer-groups <-> /customer-groups/[id].
export default async function CohortsLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/customer-groups"
      listSlot={
        <SellerBootstrapBoundary<CohortsLandingResponse>
          path="/api/tenant/cohorts?limit=50"
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/customer-groups"
              ariaLabel="Loading customer groups"
              expandedFallback={<CohortsLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <CohortsLandingClient initialData={initialData} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
