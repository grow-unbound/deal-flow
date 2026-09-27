import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { CategoriesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function ProductCategoriesLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.products.categories} expandedFallback={<CategoriesLandingSkeleton />} listOnly />;
}
