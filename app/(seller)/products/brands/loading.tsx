import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function ProductBrandsLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.products.brands} expandedFallback={<BrandsLandingSkeleton />} listOnly />;
}
