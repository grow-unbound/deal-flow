'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Archive, PencilIcon } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ROLES } from '@/constants';
import { PageWrap } from '@/components/seller/layout';
import { DetailCardRenderer, DetailHeader, DetailTabs, MetricGrid, PerformanceCard, RankedList, type DetailCardPayload } from '@/components/seller/detail';
import { PriceListDetailSkeleton as SharedPriceListDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
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
    initialState: 'performance',
  });
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isLoading, isError } = usePriceListDetail(id);
  const priceListAction = usePriceListAction(id);

  const priceList = data?.price_list;

  const tabs = useMemo(() => {
    const itemsCount = priceList?.items?.length ?? 0;
    const activityCount = priceList?.activity?.length ?? 0;
    return [
      { id: 'performance', label: 'Performance' },
      { id: 'products', label: isSellerAdmin ? 'Products and pricing' : 'Details', badge: itemsCount },
      { id: 'activity', label: 'Activity', badge: activityCount },
    ];
  }, [isSellerAdmin, priceList?.activity?.length, priceList?.items?.length]);

  useEffect(() => {
    if (!priceList) return;
    const validIds = new Set(tabs.map((t) => t.id));
    if (!validIds.has(activeTab)) setActiveTab('performance');
  }, [activeTab, priceList, setActiveTab, tabs]);

  const tabActive = tabs.some((t) => t.id === activeTab) ? activeTab : 'performance';

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
                        <Link href={`/price-lists/${id}/edit`}>
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

              {tabActive === 'performance' ? (
                <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {priceList.performance_cards?.length ? (
                    priceList.performance_cards.map((card) => (
                      <DetailCardRenderer key={(card as DetailCardPayload).id} card={card as DetailCardPayload} />
                    ))
                  ) : (
                    <>
                  <DetailCardRenderer
                    card={{
                      id: 'price-list-recipients',
                      representation: 'distribution',
                      title: 'Who receives this pricing',
                      subtitle: 'Assignment mix by target type',
                      body: {
                        items: [
                          {
                            id: 'buyer',
                            label: 'Buyer specific',
                            value: priceList.assignments.filter((assignment) => assignment.target_type === 'buyer').length,
                            pct: priceList.assignments.length > 0 ? Math.round((priceList.assignments.filter((assignment) => assignment.target_type === 'buyer').length / priceList.assignments.length) * 100) : 0,
                          },
                          {
                            id: 'cohort',
                            label: 'Customer group',
                            value: priceList.assignments.filter((assignment) => assignment.target_type === 'cohort').length,
                            pct: priceList.assignments.length > 0 ? Math.round((priceList.assignments.filter((assignment) => assignment.target_type === 'cohort').length / priceList.assignments.length) * 100) : 0,
                          },
                          {
                            id: 'all-buyers',
                            label: 'All buyers',
                            value: priceList.assignments.filter((assignment) => assignment.target_type === 'all_buyers').length,
                            pct: priceList.assignments.length > 0 ? Math.round((priceList.assignments.filter((assignment) => assignment.target_type === 'all_buyers').length / priceList.assignments.length) * 100) : 0,
                          },
                        ].filter((item) => item.value > 0),
                        emptyTitle: 'No assignments yet',
                        emptyDescription: 'This price list is not assigned to any buyer segments yet.',
                      },
                    }}
                  />

                  <DetailCardRenderer
                    card={{
                      id: 'price-list-discount-bands',
                      representation: 'distribution',
                      title: 'Discount bands and price checks',
                      subtitle: 'Current item pricing posture',
                      body: {
                        items: [
                          {
                            id: 'discounted',
                            label: 'Discounted vs base',
                            value: priceList.items.filter((item) => {
                              const base = item.tenant_product?.base_selling_price ?? null;
                              return base != null && item.price < base;
                            }).length,
                            pct: priceList.items.length > 0 ? Math.round((priceList.items.filter((item) => {
                              const base = item.tenant_product?.base_selling_price ?? null;
                              return base != null && item.price < base;
                            }).length / priceList.items.length) * 100) : 0,
                          },
                          {
                            id: 'at-base',
                            label: 'At base price',
                            value: priceList.items.filter((item) => {
                              const base = item.tenant_product?.base_selling_price ?? null;
                              return base != null && Math.abs(item.price - base) < 0.0001;
                            }).length,
                            pct: priceList.items.length > 0 ? Math.round((priceList.items.filter((item) => {
                              const base = item.tenant_product?.base_selling_price ?? null;
                              return base != null && Math.abs(item.price - base) < 0.0001;
                            }).length / priceList.items.length) * 100) : 0,
                          },
                          {
                            id: 'above-base',
                            label: 'Above base',
                            value: priceList.items.filter((item) => {
                              const base = item.tenant_product?.base_selling_price ?? null;
                              return base != null && item.price > base;
                            }).length,
                            pct: priceList.items.length > 0 ? Math.round((priceList.items.filter((item) => {
                              const base = item.tenant_product?.base_selling_price ?? null;
                              return base != null && item.price > base;
                            }).length / priceList.items.length) * 100) : 0,
                          },
                        ].filter((item) => item.value > 0),
                        emptyTitle: 'No priced items yet',
                        emptyDescription: 'Discount and price posture will appear once this list has line items.',
                      },
                    }}
                  />

                  <DetailCardRenderer
                    card={{
                      id: 'price-list-coverage-gaps',
                      representation: 'unavailable',
                      title: 'Product coverage gaps',
                      subtitle: 'Eligibility universe not yet available in this surface',
                      availability: 'unavailable',
                      body: {
                        title: 'Unavailable',
                        description: 'Coverage gaps are not shown here until this page has the eligible product universe for a bounded comparison.',
                      },
                    }}
                  />

                  <DetailCardRenderer
                    card={{
                      id: 'price-list-assigned-entities',
                      representation: 'ranked_list',
                      title: 'Assigned entities',
                      subtitle: 'Current recipient list',
                      body: {
                        items: priceList.assignments.map((assignment) => ({
                          id: assignment.id,
                          label: assignment.label ?? 'Unlabeled assignment',
                          meta: assignment.target_type === 'cohort' ? 'Customer group' : assignment.target_type === 'buyer' ? 'Buyer specific' : 'All buyers',
                          value: assignment.members != null ? `${assignment.members}` : undefined,
                          supporting: assignment.priority != null ? `Priority ${assignment.priority}` : 'Active assignment',
                        })),
                        emptyTitle: 'No recipients yet',
                        emptyDescription: 'Assign this price list to buyers or customer groups to see recipients here.',
                      },
                    }}
                  />
                    </>
                  )}
                </section>
              ) : null}

              {tabActive === 'products' ? (
                <PriceListProductsTab
                  priceListId={id}
                  filters={priceList.filters}
                  items={priceList.items}
                  brandsCovered={priceList.stats?.brands_covered ?? 0}
                  canViewFinancials={isSellerAdmin}
                />
              ) : null}

              {tabActive === 'activity' ? (
                <section className="mt-5">
                  <PerformanceCard title="Activity log" subtitle="Operational audit trail for this price list" bodyClassName="p-0">
                    <RankedList
                      items={(priceList.activity ?? []).map((entry) => ({
                        id: String(entry.id),
                        label: entry.action.replace('_', ' '),
                        meta: new Date(entry.ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        supporting: entry.diff ? JSON.stringify(entry.diff).slice(0, 120) : 'No field diff recorded',
                      }))}
                      emptyTitle="No activity yet"
                      emptyDescription="Changes to this price list will be logged here."
                    />
                  </PerformanceCard>
                </section>
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
