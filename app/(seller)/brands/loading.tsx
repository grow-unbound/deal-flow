'use client';

import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function BrandsLoading() {
  return <SplitPaneRouteLoading basePath="/brands" expandedFallback={<BrandsLandingSkeleton />} />;
}
