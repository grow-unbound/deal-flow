'use client';

import { ProductsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function ProductsLoading() {
  return <SplitPaneRouteLoading basePath="/products" expandedFallback={<ProductsLandingSkeleton />} />;
}
