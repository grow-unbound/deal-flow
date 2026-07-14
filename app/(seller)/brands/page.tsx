import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';
import type { TenantBrandsResponse } from '@/hooks/useBrands';
import { FLAGS, getFlag } from '@/lib/flags';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function BrandsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenantId = await requireSellerServerTenantId();

  if (!(await getFlag(FLAGS.BRAND_PRODUCT_MASTER, tenantId))) {
    return <FeatureForbiddenPage />;
  }

  const period = await resolveSellerLandingPeriod(searchParams);
  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<TenantBrandsResponse>(`/api/tenant/brands?period=${period}&limit=50`);
  if (status === 403) return <FeatureForbiddenPage />;
  return <BrandsLandingClient initialData={initialData} initialPeriod={period} initialSearch={initialSearch} />;
}
