import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import type { ReactNode } from 'react';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { InvoicesLandingClient } from '@/components/seller/invoices/InvoicesLandingClient';
import { InvoicesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneBootstrapFallback } from '@/components/seller/mobile';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import { EntitySplitShell } from '@/components/seller/layout';
import type { InvoicesLandingMetricsV4 } from '@/hooks/useInvoices';
import { DEFAULT_SELLER_LANDING_PERIOD } from '@/lib/seller-period';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

// Note: `?search=`/`?period=` seeding now happens client-side inside
// InvoicesLandingClient via useSearchParams() — layouts (unlike page.tsx) don't
// receive `searchParams` from Next.js, and the list now lives here so it can stay
// mounted across /invoices <-> /invoices/[id]. The SSR bootstrap fetch below
// always uses the default period; a deep link with an explicit `?period=` briefly
// shows the default period's data until the client-side period hook corrects it.
export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.invoices);

export default async function InvoicesLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell
      basePath="/invoices"
      listSlot={
        <SellerBootstrapBoundary<InvoicesLandingMetricsV4>
          path={`/api/tenant/invoices/metrics?period=${DEFAULT_SELLER_LANDING_PERIOD}`}
          fallback={
            <SplitPaneBootstrapFallback
              basePath="/invoices"
              ariaLabel="Loading invoices"
              showTransactionTabs
              variant="transaction"
              expandedFallback={<InvoicesLandingSkeleton />}
            />
          }
          render={(initialData, status) => {
            if (status === 403) return <FeatureForbiddenPage />;
            return <InvoicesLandingClient initialMetrics={initialData} initialPeriod={DEFAULT_SELLER_LANDING_PERIOD} />;
          }}
        />
      }
    >
      {children}
    </EntitySplitShell>
  );
}
