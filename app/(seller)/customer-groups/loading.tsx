'use client';

import { CohortsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function CohortsLoading() {
  return <SplitPaneRouteLoading basePath="/customer-groups" expandedFallback={<CohortsLandingSkeleton />} />;
}
