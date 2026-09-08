'use client';

import { CategoriesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function CategoriesLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.products.categories} expandedFallback={<CategoriesLandingSkeleton />} />;
}
