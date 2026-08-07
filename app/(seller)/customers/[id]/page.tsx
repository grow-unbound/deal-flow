'use client';

import { use, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { CircleDollarSign, MailPlus, PencilIcon, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FeatureGate } from '@/components/FeatureGate';
import { ErrorState } from '@/components/ui/empty-state';
import { InsightStrip4 } from '@/components/seller/layout';
import { DetailActions, DetailHeader, DetailTabs, PerformanceCard, RankedList, type DetailActionItem } from '@/components/seller/detail';
import { CollectCustomerPaymentDialog } from '@/components/seller/customers/detail';
import { CustomerDetailsTab } from '@/components/seller/customers/detail/CustomerDetailsTab';
import { CustomerOrdersTab } from '@/components/seller/customers/detail/CustomerOrdersTab';
import { CustomerPriceListsTab } from '@/components/seller/customers/detail/CustomerPriceListsTab';
import { AddCustomerDialog } from '@/components/seller/customers/AddCustomerDialog';
import { toast } from 'sonner';

const CustomerPerformanceTab = dynamic(
  () => import('@/components/seller/customers/detail/CustomerPerformanceTab').then((m) => m.CustomerPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
import { useRole } from '@/hooks/useRole';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { useTenantCustomerDetail, useToggleCustomerStatusOptimistic } from '@/hooks/useCustomersLanding';
import { formatNumberValue } from '@/lib/utils';
import { CustomerDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type TabId = 'details' | 'performance' | 'orders' | 'estimates' | 'invoices' | 'cohorts' | 'price-lists';

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
  const showPerformanceTab = false;
  const { data: settings } = useTenantSettings();
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-customer-detail-tab',
    scopeKey: id,
    initialState: 'details',
  });
  const { data, isLoading, isError, error } = useTenantCustomerDetail(id, { includePerformance: false });
  const deleteMutation = useToggleCustomerStatusOptimistic(id);
  const [editOpen, setEditOpen] = useState(false);
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const featureVisibility = useMemo(() => ({
    estimates: settings?.modules.orders.features.enquiries !== false,
    salesOrders: settings?.modules.orders.features.sales_orders !== false,
    invoices: settings?.modules.orders.features.invoices !== false,
    priceLists: settings?.modules.catalog.price_lists_enabled !== false,
  }), [settings?.modules.catalog.price_lists_enabled, settings?.modules.orders.features.enquiries, settings?.modules.orders.features.invoices, settings?.modules.orders.features.sales_orders]);

  const tabs = useMemo(
    () => [
      { id: 'details', label: 'Details' },
      ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
      ...(featureVisibility.estimates ? [{ id: 'estimates', label: 'Estimates', badge: data?.tab_badges.estimates_90d ?? 0 }] : []),
      ...(featureVisibility.salesOrders ? [{ id: 'orders', label: 'Orders', badge: data?.tab_badges.orders_90d ?? 0 }] : []),
      ...(featureVisibility.invoices ? [{ id: 'invoices', label: 'Invoices', badge: data?.tab_badges.invoices_90d ?? 0 }] : []),
      { id: 'cohorts', label: 'Customer Groups', badge: data?.cohorts_summary.rows.length ?? 0 },
      ...(featureVisibility.priceLists ? [{ id: 'price-lists', label: 'Price Lists', badge: data?.tab_badges.price_lists_assigned ?? 0 }] : []),
    ],
    [data?.cohorts_summary.rows.length, data?.tab_badges.estimates_90d, data?.tab_badges.invoices_90d, data?.tab_badges.orders_90d, data?.tab_badges.price_lists_assigned, featureVisibility.estimates, featureVisibility.invoices, featureVisibility.priceLists, featureVisibility.salesOrders, showPerformanceTab],
  );
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'details';

  useEffect(() => {
    if (activeTab !== tab) {
      setTab(activeTab as TabId);
    }
  }, [activeTab, setTab, tab]);

  const tiles = useMemo(() => {
    if (!data) return [];
    const strip = data.meta_strip_4;
    const demandLabel = strip.primary_demand_kind === 'estimates' ? 'estimate' : 'order';
    const trend = (pct: number | null): { delta: string; deltaTone: 'up' | 'down' } | undefined => {
      if (pct == null || pct === 0) return undefined;
      return { delta: `${pct > 0 ? '+' : ''}${pct}%`, deltaTone: pct > 0 ? 'up' : 'down' };
    };
    return [
      {
        label: 'Sales · QTD',
        value: formatNumberValue(strip.sales_qtd_value, 'CURRENCY_THRESHOLD'),
        sub: `${strip.sales_qtd_count} invoices`,
        ...trend(strip.sales_qtd_trend_pct),
      },
      {
        label: 'Outstanding dues',
        value: formatNumberValue(strip.receivable_amount, 'CURRENCY_THRESHOLD'),
        sub: `${strip.receivable_invoice_count} invoices · ${formatNumberValue(strip.overdue_amount, 'CURRENCY_THRESHOLD')} overdue (${strip.overdue_invoice_count})`,
        tone: strip.overdue_amount > 0 ? ('warn' as const) : undefined,
      },
      {
        label: 'Demand · QTD',
        value: formatNumberValue(strip.demand_qtd_value, 'CURRENCY_THRESHOLD'),
        sub: strip.demand_qtd_count > 0 ? `${strip.demand_qtd_count} ${demandLabel}${strip.demand_qtd_count === 1 ? '' : 's'}` : 'No demand this quarter',
        ...trend(strip.demand_qtd_trend_pct),
      },
      {
        label: 'App engagement',
        value: formatNumberValue(strip.app_engagement_value, 'CURRENCY_THRESHOLD'),
        sub: `${strip.app_engagement_count} buyer app demand doc${strip.app_engagement_count === 1 ? '' : 's'}`,
      },
    ];
  }, [data]);

  if (isError || (!isLoading && !data)) {
    return <ErrorState heading="Couldn't load customer" description={error?.message ?? 'There was a problem fetching this customer detail page.'} />;
  }

  if (isLoading && !data) return <CustomerDetailSkeleton />;

  const hasOutstandingDues = (data?.meta_strip_4.credit_used ?? 0) > 0;

  return (
    <FeatureGate flag="CUSTOMER_MASTER">
      <div className="px-4 py-4 md:px-6 md:py-4">
        <DetailHeader
          loading={isLoading}
          avatar={{ kind: 'brand', initials: data?.header.initials ?? 'CU', hue: data?.header.hue ?? 'cream' }}
          title={data?.header.buyer_name ?? ''}
          status={{ label: data?.header.status_label ?? '', tone: data?.header.status_tone ?? 'neutral' }}
          subtitle={
            data
              ? [
                  data.header.subtitle_meta.buyer_app_status_label,
                  data.header.subtitle_meta.city,
                  data.header.subtitle_meta.phone,
                  formatLastActivity(data.header.subtitle_meta),
                ]
              : []
          }
          actions={
            <DetailActions
              inline={
                <>
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
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={() => toast.info('Send Message will be added in a later phase.')}
                  >
                    <MailPlus size={16} />
                    Send message
                  </Button>
                </>
              }
              overflow={
                isSellerAdmin && data
                  ? ([
                      data.details.is_active
                        ? {
                            label: 'Delete buyer',
                            icon: <Trash2 size={14} />,
                            onClick: () => setDeleteConfirmOpen(true),
                            destructive: true,
                          }
                        : null,
                      {
                        label: 'Edit buyer',
                        icon: <PencilIcon size={14} />,
                        onClick: () => setEditOpen(true),
                      },
                    ].filter(Boolean) as DetailActionItem[])
                  : []
              }
            />
          }
        />

        {data ? (
          <InsightStrip4 className="mt-6" showSupportingText tiles={tiles} />
        ) : (
          <div className="mt-6 grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-[14px]" />
            ))}
          </div>
        )}

        <DetailTabs
          tabs={tabs}
          active={activeTab}
          onChange={(value) => setTab(value as TabId)}
        />

        {activeTab === 'details' ? (
          data ? <CustomerDetailsTab id={id} details={data.details} /> : <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
        ) : null}
        {showPerformanceTab && activeTab === 'performance' ? (
          data ? (
            <CustomerPerformanceTab
              performance={data.performance}
              performanceV2={data.performance_v2}
              performanceCards={data.performance_cards}
            />
          ) : (
            <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
          )
        ) : null}
        {activeTab === 'estimates' ? (
          data ? (
            <CustomerOrdersTab
              buyerId={id}
              buyerName={data.header.buyer_name}
              kind="estimate"
              title="Estimates"
              routeBase="/estimates"
            />
          ) : (
            <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
          )
        ) : null}
        {activeTab === 'orders' ? (
          data ? <CustomerOrdersTab buyerId={id} buyerName={data.header.buyer_name} kind="order" /> : <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
        ) : null}
        {activeTab === 'invoices' ? (
          data ? (
            <CustomerOrdersTab
              buyerId={id}
              buyerName={data.header.buyer_name}
              kind="invoice"
              title="Invoices"
              routeBase="/invoices"
            />
          ) : (
            <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
          )
        ) : null}
        {activeTab === 'cohorts' ? (
          data ? (
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
          ) : (
            <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
          )
        ) : null}
        {activeTab === 'price-lists' ? (
          <CustomerPriceListsTab buyerId={id} />
        ) : null}

        {data ? (
          <AddCustomerDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            customerId={id}
            assignedPriceListName={data.details.assigned_price_list}
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
        ) : null}
        <CollectCustomerPaymentDialog
          buyerId={id}
          buyerName={data?.header.buyer_name ?? ''}
          open={collectPaymentOpen}
          onOpenChange={setCollectPaymentOpen}
        />
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
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
      </div>
    </FeatureGate>
  );
}
