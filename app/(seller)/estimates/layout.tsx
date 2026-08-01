import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EstimatesLandingClient } from '@/components/seller/estimates/EstimatesLandingClient';
import { EstimatesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { TenantEstimatesResponse } from '@/types/tenant-estimates';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=`/`?period=` seeding now happens client-side inside
// EstimatesLandingClient via useSearchParams() — layouts (unlike page.tsx) don't
// receive `searchParams` from Next.js, and the list now lives here so it can stay
// mounted across /estimates <-> /estimates/[id]. The SSR bootstrap fetch below
// always uses the default period; a deep link with an explicit `?period=` briefly
// shows the default period's data until the client-side period hook corrects it.
export default async function EstimatesLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/estimates"
      listSlot={
        <SellerBootstrapBoundary<TenantEstimatesResponse>
          path={`/api/tenant/estimates?limit=500&period=${DEFAULT_SELLER_LANDING_PERIOD}`}
          fallback={<EstimatesLandingSkeleton />}
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <EstimatesLandingClient initialData={initialData} initialPeriod={DEFAULT_SELLER_LANDING_PERIOD} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
