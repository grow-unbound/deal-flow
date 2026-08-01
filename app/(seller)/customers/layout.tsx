import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';
import { CustomersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { CustomersLandingResponse } from '@/hooks/useCustomersLanding';
import { PAGE_SIZE } from '@/lib/pagination';
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
        <SellerBootstrapBoundary<CustomersLandingResponse>
          // Only `.kpis`/`.callouts` from this response are consumed on first paint (both
          // computed server-side from unbounded queries, independent of this limit) — the
          // `.buyers` row array itself is discarded and refetched by a separate cursor-paginated
          // query (useCustomersLandingInfinite). Keep this limit small; it's pure serialization cost.
          path={`/api/tenant/customers?limit=${PAGE_SIZE.SELLER}&period=last90`}
          fallback={<CustomersLandingSkeleton />}
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
