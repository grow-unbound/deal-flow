import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrdersLandingClient } from '@/components/seller/sales-orders/SalesOrdersLandingClient';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantOrdersResponse>(
    `/api/tenant/orders?limit=200&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <SalesOrdersLandingClient initialData={initialData} initialPeriod={period} />;
}
