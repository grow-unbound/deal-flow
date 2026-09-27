import { redirect } from 'next/navigation';

import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { sellerHomeRoute } from '@/lib/server/pulse-access';
import { getSellerServerClaims, requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.buyerApp);

export default async function BuyerAppPage() {
  await requireSellerServerTenantId();
  const claims = await getSellerServerClaims();
  redirect(sellerHomeRoute(claims.role));
}
