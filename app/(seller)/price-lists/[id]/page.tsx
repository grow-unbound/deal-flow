'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Archive, PencilIcon } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ROLES } from '@/constants';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetricGrid } from '@/components/seller/detail';
import { PriceListDetailSkeleton as SharedPriceListDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PriceListProductsTab } from '@/components/seller/price-lists/detail/PriceListProductsTab';
import { getDiscountBandCounts } from '@/lib/price-list-pricing-checks';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { usePriceListAction, usePriceListDetail } from '@/hooks/usePriceLists';
import { useRole } from '@/hooks/useRole';
import { formatNumberValue } from '@/lib/utils';

const PriceListPerformanceTab = dynamic(
  () => import('@/components/seller/price-lists/detail/PriceListPerformanceTab').then((m) => m.PriceListPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const priceListId = typeof id === 'string' ? id : '';
  const router = useRouter();
  const { isSellerAdmin } = useRole();

  const { state: activeTab, setState: setActiveTab } = useRouteSnapshot<string>({
    storageKey: 'seller-price-list-detail-tab',
    scopeKey: priceListId,
    initialState: 'performance',
  });
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isLoading, isError } = usePriceListDetail(priceListId);
  const priceListAction = usePriceListAction(priceListId);

  const priceList = data?.price_list;
  const isBootstrapping = !priceListId || isLoading;

  const tabs = useMemo(() => {
    const itemsCount = priceList?.items?.length ?? 0;
    return [
      { id: 'performance', label: 'Performance' },
      { id: 'products', label: isSellerAdmin ? 'Products and pricing' : 'Details', badge: itemsCount },
    ];
  }, [isSellerAdmin, priceList?.items?.length]);

  useEffect(() => {
    if (!priceList) return;
    const validIds = new Set(tabs.map((t) => t.id));
    if (!validIds.has(activeTab)) setActiveTab('performance');
  }, [activeTab, priceList, setActiveTab, tabs]);

  const tabActive = tabs.some((t) => t.id === activeTab) ? activeTab : 'performance';

  const discountBands = useMemo(
    () => (priceList ? getDiscountBandCounts(priceList) : { discounted: 0, atBase: 0, aboveBase: 0, total: 0 }),
    [priceList],
  );

  const subtitle = priceList
    ? [
        `${priceList.items.length} products`,
        `Valid ${formatDate(priceList.valid_from)} → ${formatDate(priceList.valid_to)}`,
      ]
    : ['—', '—'];

  return (
    <FeatureGate flag="PRICING_ENGINE">
      <RoleGuard roles={[ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT]}>
        <PageWrap className="pt-7 pb-10">
          {isBootstrapping ? (
            <SharedPriceListDetailSkeleton />
          ) : isError || !priceList ? (
            <div className="rounded-[14px] border border-danger-200 bg-danger-50 p-4 text-base text-danger-700">
              Price list not found.
            </div>
          ) : (
            <>
              <DetailHeader
                crumbPath={[
                  { label: 'Price Lists', href: '/price-lists' },
                  { label: priceList.name, current: true },
                ]}
                avatar={{ kind: 'catalog', initials: priceList.initials ?? 'PL', hue: 'teal' }}
                title={priceList.name}
                status={{ label: priceList.status_label ?? 'Active', tone: priceList.status_tone ?? 'success' }}
                subtitle={subtitle}
                actions={
                  isSellerAdmin ? (
                    <div className="flex items-center gap-2 pt-1">
                    <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => setArchiveOpen(true)}>
                      <Archive size={14} aria-hidden />
                      Archive pricelist
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                        <Link href={`/price-lists/${priceListId}/edit`}>
                          <PencilIcon size={14} aria-hidden />
                          Edit pricelist
                        </Link>
                    </Button>
                    </div>
                  ) : null
                }
              />

              <MetricGrid
                className="mt-6"
                showSupportingText
                tiles={[
                  {
                    label: 'Products priced',
                    value: priceList.stats?.products_covered ?? priceList.items.length,
                    sub: `across ${priceList.stats?.brands_covered ?? 0} brands`,
                  },
                  {
                    label: 'Customers assigned',
                    value: priceList.stats?.assignments_count ?? priceList.assignments.length,
                    sub: 'customers',
                  },
                  {
                    label: 'Average discount',
                    value: `${formatNumberValue(priceList.stats?.avg_discount_pct ?? 0, 'PERCENTAGE')}`,
                    sub: 'from base selling price',
                  },
                  {
                    label: 'Discounted products',
                    value: `${formatNumberValue(discountBands.discounted, 'COUNT')}`,
                    sub: 'priced below base selling price',
                  },
                ]}
              />

              <DetailTabs tabs={tabs} active={tabActive} onChange={setActiveTab} />

              {tabActive === 'performance' ? (
                <PriceListPerformanceTab priceList={priceList} performanceCards={priceList.performance_cards} />
              ) : null}

              {tabActive === 'products' ? (
                <PriceListProductsTab
                  priceListId={priceListId}
                  filters={priceList.filters}
                  items={priceList.items}
                  brandsCovered={priceList.stats?.brands_covered ?? 0}
                  canViewFinancials={isSellerAdmin}
                />
              ) : null}

              <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this price list?</AlertDialogTitle>
                    <AlertDialogDescription>This will remove it from active views.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => priceListAction.mutate({ action: 'archive' }, { onSuccess: () => router.push('/price-lists') })}
                    >
                      <Archive size={14} aria-hidden />
                      Archive
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </PageWrap>
      </RoleGuard>
    </FeatureGate>
  );
}
