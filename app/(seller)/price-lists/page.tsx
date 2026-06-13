import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { PriceListsLandingClient } from '@/components/seller/price-lists/PriceListsLandingClient';
import type { PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

export default async function PriceListsPage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const { data: initialData, status } = await fetchSellerPageBootstrap<PriceListsLandingResponse>('/api/price-lists');
  if (status === 403) return <FeatureForbiddenPage />;
  return <PriceListsLandingClient initialData={initialData} />;
}
