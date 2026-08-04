'use client';

import { WarehousesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function WarehousesLoading() {
  return <SplitPaneRouteLoading basePath="/warehouses" expandedFallback={<WarehousesLandingSkeleton />} />;
}
