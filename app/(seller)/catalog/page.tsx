import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';
import { CatalogControlCenterClient } from '@/components/seller/catalog/CatalogControlCenterClient';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.catalogs);

export default function CatalogPage() {
  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Market"
        title="Catalog"
        subtitle="Control what buyers see, whether prices are shown, and how enquiries are collected."
      />
      <div className="pt-6">
        <CatalogControlCenterClient />
      </div>
    </PageWrap>
  );
}
