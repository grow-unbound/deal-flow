'use client';

import { use, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { CircleDollarSign, MailPlus, PencilIcon, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FeatureGate } from '@/components/FeatureGate';
import { ErrorState } from '@/components/ui/empty-state';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetricGrid, PerformanceCard, RankedList } from '@/components/seller/detail';
import { CollectCustomerPaymentDialog } from '@/components/seller/customers/detail';
import { CustomerDetailsTab } from '@/components/seller/customers/detail/CustomerDetailsTab';
import { CustomerOrdersTab } from '@/components/seller/customers/detail/CustomerOrdersTab';
import { CustomerPriceListsTab } from '@/components/seller/customers/detail/CustomerPriceListsTab';
import { AddCustomerDialog } from '@/components/seller/customers/AddCustomerDialog';
import { toast } from 'sonner';
import { CustomerDetailSkeleton as SharedCustomerDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

const CustomerPerformanceTab = dynamic(
  () => import('@/components/seller/customers/detail/CustomerPerformanceTab').then((m) => m.CustomerPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
import { useRole } from '@/hooks/useRole';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { useTenantCustomerDetail, useToggleCustomerStatusOptimistic } from '@/hooks/useCustomersLanding';
import { formatCompactInr } from '@/lib/utils';

type TabId = 'details' | 'performance' | 'orders' | 'estimates' | 'invoices' | 'cohorts' | 'price-lists';

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
              <Skeleton className="h-9 w-28 rounded-[8px]" />
              <Skeleton className="h-9 w-24 rounded-[8px]" />
              <Skeleton className="h-9 w-24 rounded-[8px]" />
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

function formatLastActivity(subtitleMeta: {
  last_activity_kind: string | null;
  last_activity_days_ago: number | null;
  last_activity_date_label: string;
}) {
  if (!subtitleMeta.last_activity_kind) return 'Last activity unavailable';
  const when =
    subtitleMeta.last_activity_days_ago != null && subtitleMeta.last_activity_days_ago <= 30
      ? `${subtitleMeta.last_activity_days_ago}d ago`
      : subtitleMeta.last_activity_date_label;
  return `Last ${subtitleMeta.last_activity_kind} ${when}`;
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isSellerAdmin, isSellerAssistant } = useRole();
  const { data: settings } = useTenantSettings();
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-customer-detail-tab',
    scopeKey: id,
    initialState: isSellerAssistant ? 'details' : 'performance',
  });
  const { data, isLoading, isError, error } = useTenantCustomerDetail(id);
  const deleteMutation = useToggleCustomerStatusOptimistic(id);
  const [editOpen, setEditOpen] = useState(false);
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);

  const featureVisibility = useMemo(() => ({
    estimates: settings?.modules.orders.features.enquiries !== false,
    salesOrders: settings?.modules.orders.features.sales_orders !== false,
    invoices: settings?.modules.orders.features.invoices !== false,
    priceLists: settings?.modules.catalog.price_lists_enabled !== false,
  }), [settings?.modules.catalog.price_lists_enabled, settings?.modules.orders.features.enquiries, settings?.modules.orders.features.invoices, settings?.modules.orders.features.sales_orders]);

  const tabs = useMemo(
    () => [
      { id: 'details', label: 'Details' },
      ...(isSellerAssistant ? [] : [{ id: 'performance', label: 'Performance' }]),
      ...(featureVisibility.estimates ? [{ id: 'estimates', label: 'Estimates', badge: data?.tab_badges.estimates_90d ?? 0 }] : []),
      ...(featureVisibility.salesOrders ? [{ id: 'orders', label: 'Orders', badge: data?.tab_badges.orders_90d ?? 0 }] : []),
      ...(featureVisibility.invoices ? [{ id: 'invoices', label: 'Invoices', badge: data?.tab_badges.invoices_90d ?? 0 }] : []),
      { id: 'cohorts', label: 'Customer Groups', badge: data?.cohorts_summary.rows.length ?? 0 },
      ...(featureVisibility.priceLists ? [{ id: 'price-lists', label: 'Price Lists', badge: data?.tab_badges.price_lists_assigned ?? 0 }] : []),
    ],
    [data?.cohorts_summary.rows.length, data?.tab_badges.estimates_90d, data?.tab_badges.invoices_90d, data?.tab_badges.orders_90d, data?.tab_badges.price_lists_assigned, featureVisibility.estimates, featureVisibility.invoices, featureVisibility.priceLists, featureVisibility.salesOrders, isSellerAssistant],
  );
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'details';

  useEffect(() => {
    if (activeTab !== tab) {
      setTab(activeTab as TabId);
    }
  }, [activeTab, setTab, tab]);

  const tiles = useMemo(() => {
    if (!data) return [];
    const demandCount = data.meta_strip_4.primary_demand_kind === 'orders'
      ? data.meta_strip_4.demand_order_count_90d
      : data.meta_strip_4.primary_demand_kind === 'estimates'
        ? data.meta_strip_4.demand_estimate_count_90d
        : 0;
    const demandLabel = data.meta_strip_4.primary_demand_kind === 'estimates' ? 'estimate' : 'order';
    return [
      {
        label: 'Invoiced sales · 90D',
        value: formatCompactInr(data.meta_strip_4.invoiced_sales_90d),
        sub: `${data.meta_strip_4.invoice_count_90d} invoices`,
      },
      {
        label: 'Demand · 90D',
        value: formatCompactInr(data.meta_strip_4.demand_90d),
        sub: demandCount > 0 ? `${demandCount} ${demandLabel}${demandCount === 1 ? '' : 's'}` : 'No recent primary demand',
      },
      {
        label: 'Credit used / available',
        value: `${formatCompactInr(data.meta_strip_4.credit_used)} / ${formatCompactInr(data.meta_strip_4.credit_available)}`,
        sub: `${data.meta_strip_4.credit_used_pct}% of ${formatCompactInr(data.meta_strip_4.credit_limit)}`,
      },
      {
        label: 'Last sale',
        value: data.meta_strip_4.last_invoice_value > 0 ? formatCompactInr(data.meta_strip_4.last_invoice_value) : '—',
        sub: data.meta_strip_4.last_invoice_date ? `Invoiced on ${new Date(data.meta_strip_4.last_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No invoice yet',
      },
    ];
  }, [data]);

  if (isLoading) return <SharedCustomerDetailSkeleton />;
  if (isError || !data) {
    return <ErrorState heading="Couldn't load customer" description={error?.message ?? 'There was a problem fetching this customer detail page.'} />;
  }

  const hasOutstandingDues = data.meta_strip_4.credit_used > 0;

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
            data.header.subtitle_meta.buyer_app_status_label,
            data.header.subtitle_meta.city,
            data.header.subtitle_meta.phone,
            formatLastActivity(data.header.subtitle_meta),
          ]}
          actions={
            <div className="flex items-center gap-2 pt-1">
              {hasOutstandingDues ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setCollectPaymentOpen(true)}
                >
                  <CircleDollarSign size={16} />
                  Collect payment
                </Button>
              ) : null}
              {isSellerAdmin ? (
                <>
                  {data.details.is_active ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="text-danger-700 hover:text-danger-800">
                          <Trash2 size={16} />
                          Delete buyer
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete buyer?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The buyer will be marked as inactive. The buyer history will not be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              deleteMutation.mutate('deactivate');
                            }}
                          >
                            {deleteMutation.isPending ? 'Saving…' : 'Delete Buyer'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                  >
                    <PencilIcon size={14} />
                    Edit buyer
                  </Button>
                </>
              ) : null}

            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => toast.info('Send Message will be added in a later phase.')}
            >
              <MailPlus size={16} />
              Send message
            </Button>
            </div>
          }
        />

        <MetricGrid className="mt-6" showSupportingText tiles={tiles} />

        <DetailTabs
          tabs={tabs}
          active={activeTab}
          onChange={(value) => setTab(value as TabId)}
        />

        {activeTab === 'details' ? <CustomerDetailsTab id={id} details={data.details} /> : null}
        {activeTab === 'performance' ? (
          <CustomerPerformanceTab
            performance={data.performance}
            performanceV2={data.performance_v2}
            performanceCards={data.performance_cards}
          />
        ) : null}
        {activeTab === 'estimates' ? (
          <CustomerOrdersTab
            buyerId={id}
            buyerName={data.header.buyer_name}
            kind="estimate"
            title="Estimates"
            routeBase="/estimates"
          />
        ) : null}
        {activeTab === 'orders' ? <CustomerOrdersTab buyerId={id} buyerName={data.header.buyer_name} kind="order" /> : null}
        {activeTab === 'invoices' ? (
          <CustomerOrdersTab
            buyerId={id}
            buyerName={data.header.buyer_name}
            kind="invoice"
            title="Invoices"
            routeBase="/invoices"
          />
        ) : null}
        {activeTab === 'cohorts' ? (
          <section className="mt-5">
            <PerformanceCard title="Customer groups" subtitle="Current memberships" bodyClassName="p-0">
              <RankedList
                items={data.cohorts_summary.rows.map((cohort) => ({
                  id: cohort.id,
                  label: cohort.name,
                  value: 'Active',
                  supporting: 'Buyer is assigned to this customer group.',
                  initials: cohort.name.slice(0, 2).toUpperCase(),
                  hue: 'cream',
                }))}
                emptyTitle="No customer group memberships yet"
                emptyDescription="This buyer is not assigned to any customer groups."
              />
            </PerformanceCard>
          </section>
        ) : null}
        {activeTab === 'price-lists' ? (
          <CustomerPriceListsTab buyerId={id} />
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
            credit_limit: data.details.credit_limit ?? 0,
            payment_terms_days: data.details.payment_terms_days ?? 0,
            default_cohort_id: data.details.default_cohort_id ?? null,
            default_price_list_id: data.details.default_price_list_id ?? null,
            buyer_app_enabled: data.details.buyer_app_enabled,
            geography: {
              city: data.details.city ?? '',
              state: data.details.state ?? '',
              pincode: data.details.pincode ?? '',
              zone: data.details.zone ?? '',
            },
          }}
        />
        <CollectCustomerPaymentDialog
          buyerId={id}
          buyerName={data.header.buyer_name}
          open={collectPaymentOpen}
          onOpenChange={setCollectPaymentOpen}
        />
      </PageWrap>
    </FeatureGate>
  );
}
