import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { WarehousesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function BusinessWarehousesLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.business.warehouses} expandedFallback={<WarehousesLandingSkeleton />} listOnly />;
}
