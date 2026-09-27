import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';
import { CatalogsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { CatalogsLandingMetricsV4 } from '@/hooks/useCatalogs';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside CatalogsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across /campaigns <-> /campaigns/[id],
// same as products/locations/brands/etc. Row data was previously SSR-fetched in
// page.tsx (initialData) but CatalogsLandingClient's useTenantCatalogs hook already
// self-fetches client-side, so dropping the SSR list fetch here matches every other
// EntitySplitShell layout — only the KPI bootstrap is server-seeded.
export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.campaigns);

export default async function CampaignsLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/campaigns"
      listSlot={
        <SellerBootstrapBoundary<CatalogsLandingMetricsV4>
          path="/api/tenant/catalogs/metrics"
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/campaigns"
              ariaLabel="Loading campaigns"
              expandedFallback={<CatalogsLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <CatalogsLandingClient initialData={null} initialMetrics={initialData} initialPeriod="last90" />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
