'use client';

import { LocationsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function LocationsLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.business.branches} expandedFallback={<LocationsLandingSkeleton />} />;
}
