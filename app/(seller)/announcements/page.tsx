import { Megaphone } from 'lucide-react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { EmptyState } from '@/components/ui/empty-state';
import { PageWrap } from '@/components/seller/layout';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.announcements);

export default function AnnouncementsPage() {
  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Market"
        title="Announcements"
        subtitle="Send buyer updates for stock arrivals, price revisions, and service notices."
      />
      <div className="pt-6">
        <EmptyState
          icon={<Megaphone size={28} strokeWidth={1.5} />}
          heading="Announcements are WIP"
          description="Buyer announcements will live here as a separate market workflow."
        />
      </div>
    </PageWrap>
  );
}
