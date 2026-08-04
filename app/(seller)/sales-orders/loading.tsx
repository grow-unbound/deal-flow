'use client';

import { SalesOrdersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function SalesOrdersLoading() {
  return <SplitPaneRouteLoading basePath="/sales-orders" expandedFallback={<SalesOrdersLandingSkeleton />} />;
}
