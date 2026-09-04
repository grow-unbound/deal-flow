import { Suspense } from 'react';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { SellerMobileSearchPage } from '@/components/seller/mobile/SellerMobileSearchPage';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.search);

export default async function SellerSearchPage() {
  await requireSellerServerTenantId();

  return (
    <Suspense>
      <SellerMobileSearchPage />
      <div className="hidden px-8 py-6 md:block">
        <p className="text-sm text-cream-700">Use the search bar in the top navigation.</p>
      </div>
    </Suspense>
  );
}
