import { PageWrap } from '@/components/seller/layout/PageWrap';
import { SellerMobileListSkeleton } from '@/components/seller/mobile/SellerMobileList';

export default function TodayLoading() {
  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" role="status" aria-label="Loading today">
        <SellerMobileListSkeleton count={6} forceVisible showLeading />
      </div>
    </PageWrap>
  );
}
