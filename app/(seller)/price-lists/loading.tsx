'use client';

import { PriceListsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function PriceListsLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.market.pricing} expandedFallback={<PriceListsLandingSkeleton />} />;
}
