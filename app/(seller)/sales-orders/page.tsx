import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrdersLandingClient } from '@/components/seller/sales-orders/SalesOrdersLandingClient';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantOrdersResponse>(
    `/api/tenant/orders?limit=200&period=${period}`,
  );
  // #region agent log
  fetch('http://127.0.0.1:7499/ingest/42159701-4a5a-4229-9bc0-a9348f871657', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '56e5c0' },
    body: JSON.stringify({
      sessionId: '56e5c0',
      runId: 'pre-fix',
      hypothesisId: 'B-ssr-bootstrap',
      location: 'app/(seller)/sales-orders/page.tsx',
      message: 'SSR bootstrap orders payload',
      data: {
        period,
        status,
        ordersCount: initialData?.orders?.length ?? null,
        periodSelected: initialData?.period?.selected ?? null,
        kpisOrdersMtd: initialData?.kpis?.orders_mtd ?? null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (status === 403) return <FeatureForbiddenPage />;
  return <SalesOrdersLandingClient initialData={initialData} initialPeriod={period} />;
}
