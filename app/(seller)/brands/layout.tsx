import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';
import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { BrandsLandingMetricsV4 } from '@/hooks/useBrands';
import { FLAGS, getFlag } from '@/lib/flags';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside BrandsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across /brands <-> /brands/[id].
export default async function BrandsLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireSellerServerTenantId();

  if (!(await getFlag(FLAGS.BRAND_PRODUCT_MASTER, tenantId))) {
    return <FeatureForbiddenPage />;
  }

  return (
    <EntitySplitShell
      basePath="/brands"
      listSlot={
        <SellerBootstrapBoundary<BrandsLandingMetricsV4>
          path="/api/tenant/brands/metrics"
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/brands"
              ariaLabel="Loading brands"
              showLeading
              eyebrowWidth="w-16"
              titleWidth="w-44"
              subtitleWidth="w-52"
              expandedFallback={<BrandsLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <BrandsLandingClient initialMetrics={initialData} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
