import { BookOpen } from 'lucide-react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { EmptyState } from '@/components/ui/empty-state';
import { PageWrap } from '@/components/seller/layout';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.catalogs);

export default function CatalogsPage() {
  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Market"
        title="Catalogs"
        subtitle="Curate always-on buyer-facing catalogs for brands, collections, and assortments."
      />
      <div className="pt-6">
        <EmptyState
          icon={<BookOpen size={28} strokeWidth={1.5} />}
          heading="Catalogs are WIP"
          description="Always-on buyer-facing catalogs will be built here separately from time-bound campaigns."
        />
      </div>
    </PageWrap>
  );
}
