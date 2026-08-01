import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';
import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { TenantBrandsResponse } from '@/hooks/useBrands';
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
        <SellerBootstrapBoundary<TenantBrandsResponse>
          path="/api/tenant/brands?period=last90&limit=50"
          fallback={<BrandsLandingSkeleton />}
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <BrandsLandingClient initialData={initialData} initialPeriod="last90" />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
