'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Archive, PencilIcon } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ROLES } from '@/constants';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, MetaStrip4, DetailTabs } from '@/components/seller/detail';
import { Button } from '@/components/ui/button';
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
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { usePriceListAction, usePriceListDetail } from '@/hooks/usePriceLists';
import { useRole } from '@/hooks/useRole';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isSellerAdmin } = useRole();

  const { state: activeTab, setState: setActiveTab } = useRouteSnapshot<string>({
    storageKey: 'seller-price-list-detail-tab',
    scopeKey: id,
    initialState: 'products',
  });
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isLoading, isError } = usePriceListDetail(id);
  const priceListAction = usePriceListAction(id);

  const priceList = data?.price_list;

  const tabs = useMemo(() => {
    const itemsCount = priceList?.items?.length ?? 0;
    return [{ id: 'products', label: isSellerAdmin ? 'Products and pricing' : 'Details', badge: itemsCount }];
  }, [isSellerAdmin, priceList?.items?.length]);

  useEffect(() => {
    if (!priceList) return;
    const validIds = new Set(tabs.map((t) => t.id));
    if (!validIds.has(activeTab)) setActiveTab('products');
  }, [activeTab, priceList, setActiveTab, tabs]);

  const tabActive = tabs.some((t) => t.id === activeTab) ? activeTab : 'products';

  const subtitle = priceList
    ? [
        `${priceList.items.length} products`,
        `Customer groups: ${priceList.assignments.filter((a) => a.target_type === 'cohort').map((a) => a.label).filter(Boolean).join(', ') || '—'}`,
        `Valid ${formatDate(priceList.valid_from)} → ${formatDate(priceList.valid_to)}`,
        `Created by ${priceList.created_by_label ?? 'Team member'}`,
      ]
    : ['—', '—', '—', '—'];

  return (
    <FeatureGate flag="PRICING_ENGINE">
      <RoleGuard roles={[ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT]}>
        <PageWrap className="pt-7 pb-10">
          {isLoading ? (
            <div className="space-y-6" role="status" aria-label="Loading price list detail">
              <div className="h-5 w-52 animate-pulse rounded border border-cream-200 bg-cream-100" />
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="h-12 w-96 animate-pulse rounded border border-cream-200 bg-cream-100" />
                  <div className="h-4 w-[540px] animate-pulse rounded border border-cream-200 bg-cream-100" />
                </div>
                <div className="h-10 w-56 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="h-[112px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
                ))}
              </div>
              <div className="h-12 w-full animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
              <div className="rounded-[14px] border border-cream-200 bg-cream-100 p-5">
                <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="h-16 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
                  <div className="h-16 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
                </div>
              </div>
              <div className="h-12 animate-pulse rounded-t-[14px] border border-cream-200 border-b-0 bg-cream-100" />
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="h-12 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
                ))}
              </div>
            </div>
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
                        <Link href={`/price-lists/${id}/edit`}>
                          <PencilIcon size={14} aria-hidden />
                          Edit pricelist
                        </Link>
                      </Button>
                    </div>
                  ) : null
                }
              />

              <MetaStrip4
                tiles={[
                  {
                    label: 'Products covered',
                    value: priceList.stats?.products_covered ?? priceList.items.length,
                    sub: `across ${priceList.stats?.brands_covered ?? 0} brands`,
                  },
                  {
                    label: 'Customer groups assigned',
                    value: priceList.stats?.assignments_count ?? priceList.assignments.length,
                    sub: 'receiving this price list',
                  },
                  {
                    label: isSellerAdmin ? 'Avg discount' : 'Pricing posture',
                    value: isSellerAdmin ? `${(priceList.stats?.avg_discount_pct ?? 0).toFixed(1)}%` : `${priceList.stats?.products_covered ?? priceList.items.length} SKUs`,
                    sub: isSellerAdmin ? 'vs base price' : 'read-only pricing reference',
                  },
                  {
                    label: 'Days left',
                    value: `${priceList.stats?.days_left ?? 0} d`,
                    sub: `valid until ${formatDate(priceList.valid_to)}`,
                  },
                ]}
              />

              <DetailTabs tabs={tabs} active={tabActive} onChange={setActiveTab} />

              {tabActive === 'products' ? (
                <PriceListProductsTab
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
