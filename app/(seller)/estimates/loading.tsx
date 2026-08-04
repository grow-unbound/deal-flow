'use client';

import { EstimatesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function EstimatesLoading() {
  return <SplitPaneRouteLoading basePath="/estimates" expandedFallback={<EstimatesLandingSkeleton />} />;
}
