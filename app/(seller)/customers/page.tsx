import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';
import type { CustomersLandingResponse } from '@/hooks/useCustomersLanding';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<CustomersLandingResponse>(
    `/api/tenant/customers?limit=300&period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <CustomersLandingClient initialData={initialData} initialPeriod={period} />;
}
