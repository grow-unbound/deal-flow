import { redirect } from 'next/navigation';

import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.buyerApp);

export default async function BuyerAppPage() {
  await requireSellerServerTenantId();
  redirect('/pulse');
}
