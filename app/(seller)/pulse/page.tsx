import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { PulseDashboardClient } from '@/components/seller/pulse/PulseDashboardClient';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.dashboard);

export default async function PulsePage() {
  await requireSellerServerTenantId();
  return <PulseDashboardClient />;
}
