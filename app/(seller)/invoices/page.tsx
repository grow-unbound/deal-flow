import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { InvoicesLandingClient } from '@/components/seller/invoices/InvoicesLandingClient';
import type { TenantInvoicesResponse } from '@/hooks/useInvoices';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantInvoicesResponse>(
    `/api/tenant/invoices?limit=200&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <InvoicesLandingClient initialData={initialData} initialPeriod={period} />;
}
