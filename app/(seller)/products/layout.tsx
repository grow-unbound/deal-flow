import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';
import { ProductsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { TenantProductsResponse } from '@/hooks/useProducts';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=` seeding now happens client-side inside ProductsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across /products <-> /products/[id].
export default async function ProductsLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/products"
      listSlot={
        <SellerBootstrapBoundary<TenantProductsResponse>
          path="/api/tenant/products?period=last90"
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/products"
              ariaLabel="Loading products"
              showLeading
              expandedFallback={<ProductsLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <ProductsLandingClient initialData={initialData} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
