'use client';

import { CatalogsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SplitPaneRouteLoading } from '@/components/seller/mobile';

export default function CampaignsLoading() {
  return <SplitPaneRouteLoading basePath="/campaigns" expandedFallback={<CatalogsLandingSkeleton />} />;
}
