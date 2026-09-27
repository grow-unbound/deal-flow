'use client';

import { ProductsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function ProductsLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.products.root} expandedFallback={<ProductsLandingSkeleton />} listOnly />;
}
