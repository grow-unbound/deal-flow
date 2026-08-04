import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';
import { CustomersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { CustomersLandingMetricsV4 } from '@/lib/customers-landing-v4-types';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside CustomersLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across /customers <-> /customers/[id].
export default async function CustomersLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/customers"
      listSlot={
        <SellerBootstrapBoundary<CustomersLandingMetricsV4>
          // Bootstrap Pulse cards only — table rows are fetched by the infinite query.
          path="/api/tenant/customers/metrics"
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/customers"
              ariaLabel="Loading customers"
              expandedFallback={<CustomersLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <CustomersLandingClient initialData={initialData} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
