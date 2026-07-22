import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';
import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SellerBootstrapBoundary } from '@/components/seller/layout/SellerBootstrapBoundary';
import type { TenantBrandsResponse } from '@/hooks/useBrands';
import { FLAGS, getFlag } from '@/lib/flags';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
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

  const initialSearch = await resolveOptionalSearchParam(searchParams);

  return (
    <SellerBootstrapBoundary<TenantBrandsResponse>
      path="/api/tenant/brands?period=last90&limit=50"
      fallback={<BrandsLandingSkeleton />}
      render={(initialData, status) => {
        if (status === 403) return <FeatureForbiddenPage />;
        return <BrandsLandingClient initialData={initialData} initialPeriod="last90" initialSearch={initialSearch} />;
      }}
    />
  );
}
