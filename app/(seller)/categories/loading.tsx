'use client';

import { CategoriesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function CategoriesLoading() {
  return <SplitPaneRouteLoading basePath="/categories" expandedFallback={<CategoriesLandingSkeleton />} />;
}
