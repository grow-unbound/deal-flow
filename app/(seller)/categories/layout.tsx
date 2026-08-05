import type { ReactNode } from 'react';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CategoriesLandingClient } from '@/components/seller/categories/CategoriesLandingClient';
import { CategoriesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';
import type { CategoriesLandingMetricsV4 } from '@/hooks/useCategories';

export const dynamic = 'force-dynamic';

// Note: `?search=` seeding now happens client-side inside CategoriesLandingClient
// via useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams`
// from Next.js, and the list now lives here so it can stay mounted across
// /categories <-> /categories/[id].
export default async function CategoriesLayout({ children }: { children: ReactNode }) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;
  if (claims.role !== 'seller_admin') return <RoleForbiddenPage />;

  return (
    <EntitySplitShell
      basePath="/categories"
      listSlot={
        <SellerBootstrapBoundary<CategoriesLandingMetricsV4>
          path="/api/tenant/categories/metrics"
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/categories"
              ariaLabel="Loading categories"
              showLeading
              expandedFallback={<CategoriesLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <RoleForbiddenPage />;
            return <CategoriesLandingClient initialMetrics={initialData} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
