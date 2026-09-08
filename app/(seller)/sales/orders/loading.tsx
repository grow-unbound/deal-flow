import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SalesOrdersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function SalesOrdersLoading() {
  return (
    <SplitPaneRouteLoading
      basePath={SELLER_ROUTES.sales.orders}
      expandedFallback={<SalesOrdersLandingSkeleton />}
      listOnly
    />
  );
}
