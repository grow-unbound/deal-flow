'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Archive, PencilIcon } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ROLES } from '@/constants';
import { InsightStrip4 } from '@/components/seller/layout';
import { DetailHeader, DetailTabs } from '@/components/seller/detail';
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
import { PriceListFormSheet } from '@/components/seller/price-lists/PriceListFormSheet';
import type { ProductMembershipRules } from '@/lib/zod';
import { PriceListDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

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
  const showPerformanceTab = false;

  const { state: activeTab, setState: setActiveTab } = useRouteSnapshot<string>({
    storageKey: 'seller-price-list-detail-tab',
    scopeKey: priceListId,
    initialState: 'products',
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, isError } = usePriceListDetail(priceListId, { includePerformance: false });
  const priceListAction = usePriceListAction(priceListId);

  const priceList = data?.price_list;

  const tabs = useMemo(() => {
    const itemsCount = priceList?.items?.length ?? 0;
    return [
      ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
      { id: 'products', label: isSellerAdmin ? 'Products and pricing' : 'Details', badge: itemsCount },
    ];
  }, [isSellerAdmin, priceList?.items?.length, showPerformanceTab]);

  useEffect(() => {
    if (!priceList) return;
    const validIds = new Set(tabs.map((t) => t.id));
    if (!validIds.has(activeTab)) setActiveTab('products');
  }, [activeTab, priceList, setActiveTab, tabs]);

  const tabActive = tabs.some((t) => t.id === activeTab) ? activeTab : 'products';

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

  if (isError || (!isLoading && priceListId && !priceList)) {
    return (
      <FeatureGate flag="PRICING_ENGINE">
        <RoleGuard roles={[ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT]}>
          <div className="px-4 py-4 md:px-6 md:py-4">
            <div className="rounded-[14px] border border-danger-200 bg-danger-50 p-4 text-base text-danger-700">
              Price list not found.
            </div>
          </div>
        </RoleGuard>
      </FeatureGate>
    );
  }

  if (isLoading && !priceList) return <PriceListDetailSkeleton />;

  return (
    <FeatureGate flag="PRICING_ENGINE">
      <RoleGuard roles={[ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT]}>
        <div className="px-4 py-4 md:px-6 md:py-4">
          <DetailHeader
            loading={!priceList}
            avatar={{ kind: 'catalog', initials: priceList?.initials ?? 'PL', hue: 'teal' }}
            title={priceList?.name ?? ''}
            status={{ label: priceList?.status_label ?? 'Active', tone: priceList?.status_tone ?? 'success' }}
            subtitle={subtitle}
            actions={
              isSellerAdmin ? (
                <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => setArchiveOpen(true)}>
                  <Archive size={14} aria-hidden />
                  Archive pricelist
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
                      <PencilIcon size={14} aria-hidden />
                      Edit pricelist
                </Button>
                </div>
              ) : null
            }
          />

          {priceList ? (
            <InsightStrip4
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
          ) : (
            <div className="mt-6 grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-[14px]" />
              ))}
            </div>
          )}

          <DetailTabs tabs={tabs} active={tabActive} onChange={setActiveTab} />

          {showPerformanceTab && tabActive === 'performance' ? (
            priceList ? <PriceListPerformanceTab priceList={priceList} performanceCards={priceList.performance_cards} /> : <Skeleton className="mt-4 h-[26rem] rounded-[14px]" />
          ) : null}
          {tabActive === 'products' ? (
            priceList ? (
              <PriceListProductsTab
                priceListId={priceListId}
                filters={priceList.filters}
                items={priceList.items}
                brandsCovered={priceList.stats?.brands_covered ?? 0}
                canViewFinancials={isSellerAdmin}
                pricingStrategy={priceList.pricing_strategy}
                strategyValue={priceList.strategy_value}
                membershipMode={priceList.membership_mode}
                name={priceList.name}
                description={priceList.description}
                validFrom={priceList.valid_from}
                validTo={priceList.valid_to}
                priority={priceList.priority}
              />
            ) : (
              <Skeleton className="mt-4 h-[26rem] rounded-[14px]" />
            )
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
          {priceList ? (
            <PriceListFormSheet
              open={editOpen}
              onOpenChange={setEditOpen}
              mode="edit"
              priceListId={priceListId}
              defaultValues={{
                form_mode: 'simple',
                name: priceList.name,
                description: priceList.description ?? '',
                valid_from: priceList.valid_from ? new Date(priceList.valid_from) : new Date(),
                valid_to: priceList.valid_to ? new Date(priceList.valid_to) : undefined,
                priority: priceList.priority,
                membership_mode: priceList.membership_mode ?? 'manual',
                rules: priceList.membership_mode === 'automatic' ? (priceList.filters as unknown as ProductMembershipRules) : undefined,
              }}
            />
          ) : null}
        </div>
      </RoleGuard>
    </FeatureGate>
  );
}
