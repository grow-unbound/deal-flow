'use client';

import { use, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Download, Share2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FeatureGate } from '@/components/FeatureGate';
import { ErrorState } from '@/components/ui/empty-state';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { ResolvedPriceLookupCard } from '@/components/seller/pricing/ResolvedPriceLookupCard';
import { CustomerActivityTab } from '@/components/seller/customers/detail/CustomerActivityTab';
import { CustomerDetailsTab } from '@/components/seller/customers/detail/CustomerDetailsTab';
import { CustomerOrdersTab } from '@/components/seller/customers/detail/CustomerOrdersTab';
import { AddCustomerDialog } from '@/components/seller/customers/AddCustomerDialog';

const CustomerPerformanceTab = dynamic(
  () => import('@/components/seller/customers/detail/CustomerPerformanceTab').then((m) => m.CustomerPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
import { useRole } from '@/hooks/useRole';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useTenantCustomerDetail, useToggleCustomerStatusOptimistic } from '@/hooks/useCustomersLanding';
import { formatCompactInr } from '@/lib/utils';

type TabId = 'details' | 'performance' | 'orders' | 'estimates' | 'invoices' | 'cohorts' | 'price-lists' | 'activity';

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
  if (!tier) return <span className="text-xs text-cream-700">Tier —</span>;
  return <span className="rounded-full bg-ember-50 px-2 py-0.5 text-xs font-medium text-ember-700">Tier {tier}</span>;
}

function formatValidityWindow(validFrom: string | null, validTo: string | null) {
  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Open';

  return `${formatDate(validFrom)} → ${formatDate(validTo)}`;
}

function PriceListStatusPill({ status }: { status: 'active' | 'draft' | 'expired' }) {
  const classes = status === 'active'
    ? 'bg-teal-50 text-teal-700'
    : status === 'expired'
      ? 'bg-cream-200 text-cream-700'
      : 'bg-amber-50 text-amber-700';

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${classes}`}>
      {status}
    </span>
  );
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isSellerAdmin, isSellerAssistant } = useRole();
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-customer-detail-tab',
    scopeKey: id,
    initialState: isSellerAssistant ? 'details' : 'performance',
  });
  const { data, isLoading, isError, error } = useTenantCustomerDetail(id);
  const statusMutation = useToggleCustomerStatusOptimistic(id);
  const [editOpen, setEditOpen] = useState(false);
  const tabs = useMemo(
    () => [
      { id: 'details', label: 'Details' },
      ...(isSellerAssistant ? [] : [{ id: 'performance', label: 'Performance' }]),
      { id: 'orders', label: 'Orders', badge: data?.orders.badge_count_mtd ?? 0 },
      { id: 'estimates', label: 'Estimates', badge: data?.estimates.rows.length ?? 0 },
      { id: 'invoices', label: 'Invoices', badge: data?.invoices.rows.length ?? 0 },
      { id: 'cohorts', label: 'Customer Groups', badge: data?.cohorts_summary.rows.length ?? 0 },
      { id: 'price-lists', label: 'Price Lists', badge: data?.price_lists.assigned.length ?? 0 },
      { id: 'activity', label: 'Activity' },
    ],
    [data?.cohorts_summary.rows.length, data?.estimates.rows.length, data?.invoices.rows.length, data?.orders.badge_count_mtd, data?.price_lists.assigned.length, isSellerAssistant],
  );
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'details';

  useEffect(() => {
    if (activeTab !== tab) {
      setTab(activeTab as TabId);
    }
  }, [activeTab, setTab, tab]);

  const tiles = useMemo(() => {
    if (!data) return [];
    if (isSellerAssistant) {
      return [
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
        {
          label: 'Net terms',
          value: `${data.header.net_terms_days} days`,
          sub: 'Buyer payment terms',
        },
      ];
    }
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
  }, [data, isSellerAssistant]);

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
              <Button type="button" className="h-9 gap-1.5 border border-cream-400 bg-white px-4 text-base font-medium text-teal-700 hover:bg-cream-100">
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
          tabs={tabs}
          active={activeTab}
          onChange={(value) => setTab(value as TabId)}
        />

        {activeTab === 'details' ? <CustomerDetailsTab id={id} details={data.details} onEdit={() => setEditOpen(true)} /> : null}
        {activeTab === 'performance' ? <CustomerPerformanceTab performance={data.performance} performanceV2={data.performance_v2} /> : null}
        {activeTab === 'orders' ? <CustomerOrdersTab kind="order" orders={data.orders.rows} /> : null}
        {activeTab === 'estimates' ? (
          <CustomerOrdersTab
            kind="estimate"
            orders={data.estimates.rows}
            title="Estimates"
            description="Drafted and sent estimates visible to this role."
            routeBase="/estimates"
          />
        ) : null}
        {activeTab === 'invoices' ? (
          <CustomerOrdersTab
            kind="invoice"
            orders={data.invoices.rows}
            title="Invoices"
            description="Issued invoices visible to this role."
            routeBase="/invoices"
          />
        ) : null}
        {activeTab === 'cohorts' ? (
          <section className="mt-5 rounded-[14px] border border-cream-300 bg-white p-5">
            <h3 className="font-display text-lg text-cream-950">Customer Groups</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.cohorts_summary.rows.length === 0 ? (
                <p className="text-base text-cream-700">No customer group memberships found for this buyer.</p>
              ) : data.cohorts_summary.rows.map((cohort) => (
                <article key={cohort.id} className="rounded-[12px] border border-cream-200 bg-cream-50 px-4 py-3">
                  <p className="font-medium text-cream-950">{cohort.name}</p>
                  <p className="mt-1 text-sm text-cream-700">Buyer is assigned to this customer group.</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {activeTab === 'price-lists' ? (
          <section className="mt-5 space-y-4">
            <article className="rounded-[14px] border border-cream-300 bg-white p-5">
              <h3 className="font-display text-lg text-cream-950">Assigned price lists</h3>
              {data.price_lists.assigned.length === 0 ? (
                <p className="mt-3 text-base text-cream-700">No buyer-specific, cohort, or all-buyers price lists currently apply to this customer.</p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {data.price_lists.assigned.map((priceList) => (
                    <article key={`${priceList.id}-${priceList.target_type}`} className="rounded-[12px] border border-cream-200 bg-cream-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-cream-950">{priceList.name}</p>
                          <p className="mt-1 text-sm text-cream-700">{priceList.target_label}</p>
                        </div>
                        <PriceListStatusPill status={priceList.status} />
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
                        Validity
                      </p>
                      <p className="mt-1 text-sm text-cream-800">
                        {formatValidityWindow(priceList.valid_from, priceList.valid_to)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </article>
            <ResolvedPriceLookupCard
              buyerId={id}
              productOptions={data.price_lists.lookup_products.map((product) => ({
                id: product.tenant_product_id,
                label: product.name,
                meta: product.sku,
              }))}
              title="Resolved price lookup"
              description="Check the live resolved price for this buyer across recently transacted products."
            />
          </section>
        ) : null}
        {activeTab === 'activity' ? <CustomerActivityTab activity={data.activity} /> : null}

        {isSellerAdmin && activeTab === 'details' ? (
          <div className="mt-4 flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
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

        <AddCustomerDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          customerId={id}
          defaultValues={{
            business_name: data.details.business_name,
            contact_name: data.details.contact_name ?? '',
            phone: data.details.phone ?? '',
            email: data.details.email ?? '',
            gstin: data.details.gstin ?? '',
            external_ref: data.details.external_ref ?? '',
            credit_limit: data.details.credit_limit ?? 0,
            payment_terms_days: data.details.payment_terms_days ?? 0,
            tier: data.details.tier ?? data.header.tier ?? undefined,
            default_cohort_id: data.details.default_cohort_id ?? null,
            geography: {
              city: data.details.city ?? '',
              state: data.details.state ?? '',
              pincode: data.details.pincode ?? '',
              zone: data.details.zone ?? '',
            },
          }}
        />
      </PageWrap>
    </FeatureGate>
  );
}
