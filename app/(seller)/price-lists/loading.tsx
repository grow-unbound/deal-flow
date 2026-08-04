'use client';

import { PriceListsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function PriceListsLoading() {
  return <SplitPaneRouteLoading basePath="/price-lists" expandedFallback={<PriceListsLandingSkeleton />} />;
}
