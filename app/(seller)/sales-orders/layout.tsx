import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrdersLandingClient } from '@/components/seller/sales-orders/SalesOrdersLandingClient';
import { SalesOrdersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=`/`?period=` seeding now happens client-side inside
// SalesOrdersLandingClient via useSearchParams() — layouts (unlike page.tsx) don't
// receive `searchParams` from Next.js, and the list now lives here so it can stay
// mounted across /sales-orders <-> /sales-orders/[id]. The SSR bootstrap fetch below
// always uses the default period; a deep link with an explicit `?period=` briefly
// shows the default period's data until the client-side period hook corrects it.
export default async function SalesOrdersLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/sales-orders"
      listSlot={
        <SellerBootstrapBoundary<TenantOrdersResponse>
          path={`/api/tenant/orders?limit=200&period=${DEFAULT_SELLER_LANDING_PERIOD}`}
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/sales-orders"
              ariaLabel="Loading sales orders"
              showTransactionTabs
              variant="transaction"
              expandedFallback={<SalesOrdersLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <SalesOrdersLandingClient initialData={initialData} initialPeriod={DEFAULT_SELLER_LANDING_PERIOD} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
