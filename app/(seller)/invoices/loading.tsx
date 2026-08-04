'use client';

import { InvoicesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function InvoicesLoading() {
  return <SplitPaneRouteLoading basePath="/invoices" expandedFallback={<InvoicesLandingSkeleton />} />;
}
