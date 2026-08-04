'use client';

import { LocationsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function LocationsLoading() {
  return <SplitPaneRouteLoading basePath="/locations" expandedFallback={<LocationsLandingSkeleton />} />;
}
