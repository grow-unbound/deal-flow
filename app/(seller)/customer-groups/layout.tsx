import { Suspense, type ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CohortsLandingClient } from '@/components/seller/cohorts/CohortsLandingClient';
import { CohortsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { EntitySplitShell } from '@/components/seller/layout';
import type { CohortsLandingMetricsV4, CohortsLandingResponse } from '@/hooks/useCohorts';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside CohortsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across
// /customer-groups <-> /customer-groups/[id].
async function CohortsListBootstrap() {
  const [{ data: initialData, status }, { data: initialMetrics }] = await Promise.all([
    fetchSellerPageBootstrap<CohortsLandingResponse>('/api/tenant/cohorts?limit=50'),
    fetchSellerPageBootstrap<CohortsLandingMetricsV4>('/api/tenant/cohorts/metrics'),
  ]);

  if (status === 403) return <FeatureForbiddenPage />;
  return <CohortsLandingClient initialData={initialData} initialMetrics={initialMetrics} />;
}

export default async function CohortsLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/customer-groups"
      listSlot={
        <Suspense
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/customer-groups"
              ariaLabel="Loading customer groups"
              eyebrowWidth="w-28"
              titleWidth="w-52"
              subtitleWidth="w-44"
              expandedFallback={<CohortsLandingSkeleton />}
            />
          }
        >
          <CohortsListBootstrap />
        </Suspense>
      }
    >
      {children}
    </EntitySplitShell>
  );
}
