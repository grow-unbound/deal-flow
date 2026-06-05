'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { Download, Share2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FeatureGate } from '@/components/FeatureGate';
import { ErrorState } from '@/components/ui/empty-state';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { CustomerActivityTab, CustomerDetailsTab, CustomerOrdersTab, CustomerPerformanceTab } from '@/components/seller/customers/detail';
import { useRole } from '@/hooks/useRole';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useTenantCustomerDetail, useToggleCustomerStatusOptimistic } from '@/hooks/useCustomersLanding';
import { formatCompactInr } from '@/lib/utils';

type TabId = 'details' | 'performance' | 'orders' | 'activity';

function CustomerDetailSkeleton() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-52" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-[14px]" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-80" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-20 rounded-[8px]" />
              <Skeleton className="h-9 w-28 rounded-[8px]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        <Skeleton className="h-[24rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function buyerSinceLabel(value: string | null, yearsLabel: string) {
  if (!value) return `Buyer since — · ${yearsLabel}`;
  const since = new Date(value).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return `Buyer since ${since} · ${yearsLabel}`;
}

function TierPill({ tier }: { tier: 'A' | 'B' | 'C' | null }) {
  if (!tier) return <span className="text-[11px] text-cream-700">Tier —</span>;
  return <span className="rounded-full bg-ember-50 px-2 py-0.5 text-[11px] font-medium text-ember-700">Tier {tier}</span>;
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-customer-detail-tab',
    scopeKey: id,
    initialState: 'performance',
  });
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError, error } = useTenantCustomerDetail(id);
  const statusMutation = useToggleCustomerStatusOptimistic(id);

  const tiles = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Spend · MTD',
        value: formatCompactInr(data.meta_strip_4.spend_mtd),
        sub: (
          <span>
            <span className={data.meta_strip_4.growth_pct >= 0 ? 'up' : 'down'}>
              {data.meta_strip_4.growth_pct >= 0 ? '↑ +' : '↓ '}
              {Math.abs(data.meta_strip_4.growth_pct).toFixed(1)}%
            </span>{' '}
            vs last month
          </span>
        ),
      },
      {
        label: 'Orders · MTD',
        value: data.meta_strip_4.orders_mtd,
        sub: `AOV ${formatCompactInr(data.meta_strip_4.aov_mtd)}`,
      },
      {
        label: 'Last order',
        value: data.meta_strip_4.last_order_label,
        sub: data.meta_strip_4.last_order_primary_product_qty,
      },
      {
        label: 'Credit used',
        value: formatCompactInr(data.meta_strip_4.credit_used),
        sub: `of ${formatCompactInr(data.meta_strip_4.credit_limit)} · ${data.meta_strip_4.credit_used_pct}%`,
      },
    ];
  }, [data]);

  if (isLoading) return <CustomerDetailSkeleton />;
  if (isError || !data) {
    return <ErrorState heading="Couldn't load customer" description={error?.message ?? 'There was a problem fetching this customer detail page.'} />;
  }

  return (
    <FeatureGate flag="CUSTOMER_MASTER">
      <PageWrap className="pt-7">
        <DetailHeader
          crumbPath={[
            { label: 'Customers', href: '/customers' },
            { label: data.header.buyer_name, current: true },
          ]}
          avatar={{ kind: 'brand', initials: data.header.initials, hue: data.header.hue }}
          title={data.header.buyer_name}
          status={{ label: data.header.status_label, tone: data.header.status_tone }}
          subtitle={[
            <TierPill key="tier" tier={data.header.tier} />,
            data.header.city,
            buyerSinceLabel(data.header.buyer_since, data.header.years_label),
            `Net ${data.header.net_terms_days} terms`,
          ]}
          actions={
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                aria-label="Share"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-cream-700 hover:bg-cream-100"
              >
                <Share2 size={14} />
              </button>
              <Button type="button" className="h-9 gap-1.5 border border-cream-400 bg-white px-4 text-[13px] font-medium text-teal-700 hover:bg-cream-100">
                <Download size={14} />
                Export
              </Button>
              <Button size="sm">
                Open buyer app preview
              </Button>
            </div>
          }
        />

        <MetaStrip4 tiles={tiles} />

        <DetailTabs
          tabs={[
            { id: 'details', label: 'Details' },
            { id: 'performance', label: 'Performance' },
            { id: 'orders', label: 'Orders', badge: data.orders.badge_count_mtd },
            { id: 'activity', label: 'Activity' },
          ]}
          active={tab}
          onChange={(value) => setTab(value as TabId)}
        />

        {tab === 'details' ? <CustomerDetailsTab id={id} details={data.details} /> : null}
        {tab === 'performance' ? <CustomerPerformanceTab performance={data.performance} performanceV2={data.performance_v2} /> : null}
        {tab === 'orders' ? <CustomerOrdersTab orders={data.orders.rows} /> : null}
        {tab === 'activity' ? <CustomerActivityTab activity={data.activity} /> : null}

        {isSellerAdmin && tab === 'details' ? (
          <div className="mt-4 flex items-center gap-2">
            <Link href={`/customers/${id}/edit`}>
              <Button type="button" variant="secondary" size="sm">Edit</Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm">
                  {data.details.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{data.details.is_active ? 'Deactivate customer?' : 'Reactivate customer?'}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {data.details.is_active
                      ? 'The buyer will no longer be able to place new orders until reactivated.'
                      : 'The buyer will be able to place orders again.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={statusMutation.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate(data.details.is_active ? 'deactivate' : 'reactivate')}
                  >
                    {statusMutation.isPending ? 'Saving…' : 'Confirm'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </PageWrap>
    </FeatureGate>
  );
}
