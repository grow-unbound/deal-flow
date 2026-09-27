import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { InvoicesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function SalesInvoicesLoading() {
  return (
    <SplitPaneRouteLoading
      basePath={SELLER_ROUTES.sales.invoices}
      expandedFallback={<InvoicesLandingSkeleton />}
      listOnly
    />
  );
}
