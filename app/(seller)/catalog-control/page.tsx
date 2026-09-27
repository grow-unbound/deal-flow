import { PageWrap } from '@/components/seller/layout';
import { CatalogControlCenterClient } from '@/components/seller/catalog/CatalogControlCenterClient';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.catalogs);

export default function CatalogPage() {
  return (
    <PageWrap>
      <CatalogControlCenterClient />
    </PageWrap>
  );
}
