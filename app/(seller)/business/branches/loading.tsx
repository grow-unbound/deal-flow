import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { LocationsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function BusinessBranchesLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.business.branches} expandedFallback={<LocationsLandingSkeleton />} listOnly />;
}
