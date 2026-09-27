'use client';

import { EstimatesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function EstimatesLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.sales.estimates} expandedFallback={<EstimatesLandingSkeleton />} />;
}
