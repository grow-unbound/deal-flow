import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { EstimatesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function SalesEstimatesLoading() {
  return (
    <SplitPaneRouteLoading
      basePath={SELLER_ROUTES.sales.estimates}
      expandedFallback={<EstimatesLandingSkeleton />}
      listOnly
    />
  );
}
