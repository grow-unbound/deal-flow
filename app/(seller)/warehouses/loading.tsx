'use client';

import { WarehousesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function WarehousesLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.business.warehouses} expandedFallback={<WarehousesLandingSkeleton />} />;
}
