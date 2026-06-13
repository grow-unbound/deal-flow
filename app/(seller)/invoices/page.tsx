import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { InvoicesLandingClient } from '@/components/seller/invoices/InvoicesLandingClient';
import type { TenantInvoicesResponse } from '@/hooks/useInvoices';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantInvoicesResponse>(
    `/api/tenant/invoices?limit=200&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <InvoicesLandingClient initialData={initialData} initialPeriod={period} />;
}
