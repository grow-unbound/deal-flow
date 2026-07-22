import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { InvoicesLandingClient } from '@/components/seller/invoices/InvoicesLandingClient';
import { InvoicesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { TenantInvoicesResponse } from '@/hooks/useInvoices';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<TenantInvoicesResponse>
      path={`/api/tenant/invoices?limit=200&period=${period}`}
      fallback={<InvoicesLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <InvoicesLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
      }}
    />
  );
}
