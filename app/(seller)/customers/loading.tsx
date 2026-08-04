'use client';

import { CustomersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function CustomersLoading() {
  return <SplitPaneRouteLoading basePath="/customers" expandedFallback={<CustomersLandingSkeleton />} />;
}
