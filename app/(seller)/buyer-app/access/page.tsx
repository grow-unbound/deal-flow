import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { ManageAccessClient } from '@/components/seller/buyer-app/ManageAccessClient';
import type { AccessPageResponse } from '@/hooks/useBuyerAppAccess';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.buyerAppAccess);

export default async function BuyerAppAccessPage() {
  await requireSellerServerTenantId();

  const { data: initialData, status } = await fetchSellerPageBootstrap<AccessPageResponse>(
    '/api/tenant/buyer-app/access',
  );

  if (status === 403) return <FeatureForbiddenPage />;

  return <ManageAccessClient initialData={initialData} />;
}
