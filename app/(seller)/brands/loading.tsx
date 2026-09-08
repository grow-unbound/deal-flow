'use client';

import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function BrandsLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.products.brands} expandedFallback={<BrandsLandingSkeleton />} />;
}
