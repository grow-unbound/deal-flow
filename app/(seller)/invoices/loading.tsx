'use client';

import { InvoicesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function InvoicesLoading() {
  return <SplitPaneRouteLoading basePath={SELLER_ROUTES.sales.invoices} expandedFallback={<InvoicesLandingSkeleton />} />;
}
