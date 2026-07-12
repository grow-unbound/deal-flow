import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { PriceListsLandingClient } from '@/components/seller/price-lists/PriceListsLandingClient';
import type { PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { resolveOptionalSearchParam } from '@/lib/server/read-search-param';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function PriceListsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();

  const initialSearch = await resolveOptionalSearchParam(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<PriceListsLandingResponse>('/api/price-lists');
  if (status === 403) return <FeatureForbiddenPage />;
  return <PriceListsLandingClient initialData={initialData} initialSearch={initialSearch} />;
}
