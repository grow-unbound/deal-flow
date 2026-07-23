'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { PencilIcon } from 'lucide-react';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetricGrid } from '@/components/seller/detail';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useLocationDetail } from '@/hooks/useLocations';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { LocationFormSheet } from '@/components/seller/settings/LocationFormSheet';
import { formatNumberValue } from '@/lib/utils';
import { LocationDetailSkeleton as SharedLocationDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LocationOrdersTab } from './LocationOrdersTab';
import { LocationEstimatesTab } from './LocationEstimatesTab';
import { LocationInvoicesTab } from './LocationInvoicesTab';
const LocationPerformanceTab = dynamic(
  () => import('./LocationPerformanceTab').then((m) => m.LocationPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

type TabId = 'performance' | 'orders' | 'estimates' | 'invoices';

interface LocationDetailPageProps {
  id: string;
}

function LocationDetailSkeleton() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-52" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-[14px]" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-80" />
              </div>
            </div>
            <Skeleton className="h-9 w-20 rounded-[8px]" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>
        <div className="rounded-[14px] border border-cream-200 bg-white p-4">
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[28rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function LocationProfileStrip({
  phoneNumber,
  status,
  users,
}: {
  phoneNumber: string | null;
  status: 'active' | 'inactive';
  users: Array<{ email: string; user_name: string | null }>;
}) {
  return (
    <div className="mt-4 rounded-[14px] border border-cream-200 bg-white p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Phone</p>
          <p className="mt-1 text-sm font-medium text-cream-900">{phoneNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Status</p>
          <p className="mt-1 text-sm font-medium text-cream-900">
            {status === 'active' ? 'Active' : 'Inactive'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Associated users</p>
          {users.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {users.map((user) => (
                <span
                  key={user.email}
                  className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 px-2.5 py-1 text-xs font-medium text-cream-800"
                  title={user.email}
                >
                  {user.user_name ?? user.email}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium text-cream-900">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function LocationDetailPage({ id }: LocationDetailPageProps) {
  const showPerformanceTab = false;
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: locationsData } = useTenantLocations();
  const editingLocation = locationsData?.locations.find((l) => l.id === id) ?? null;
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-location-detail',
    scopeKey: id,
    initialState: 'orders',
  });
  const { data, isLoading, isError, refetch } = useLocationDetail(id, { includePerformance: false });

  if (isLoading) return <SharedLocationDetailSkeleton />;
  if (isError || !data) {
    return (
      <ErrorState
        heading="Couldn't load location"
        description="There was a problem fetching this location detail page."
        onRetry={() => refetch()}
      />
    );
  }

  const meta = data.meta_strip;
  const tabs = [
    ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
    { id: 'orders', label: 'Orders', badge: data.tab_badges.orders_mtd },
    { id: 'estimates', label: 'Estimates', badge: data.tab_badges.estimates_mtd },
    { id: 'invoices', label: 'Invoices', badge: data.tab_badges.invoices_mtd },
  ];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'orders';

  useEffect(() => {
    if (activeTab !== tab) {
      setTab(activeTab as TabId);
    }
  }, [activeTab, setTab, tab]);

  const demandKindLabel =
    meta.open_primary_demand_kind === 'orders'
      ? 'Open order value'
      : meta.open_primary_demand_kind === 'estimates'
        ? 'Open estimate value'
        : 'Open primary demand value';

  const tiles = [
    {
      label: 'Invoiced sales 90D',
      value: formatNumberValue(meta.gmv_mtd, 'CURRENCY_THRESHOLD'),
    },
    {
      label: 'Overdue amount',
      value: formatNumberValue(meta.overdue_amount, 'CURRENCY_THRESHOLD'),
      sub:
        meta.overdue_amount > 0 ? (
          <span className="text-danger-600">across {meta.unpaid_invoice_count} invoices</span>
        ) : undefined,
    },
    {
      label: 'Customers who purchased here',
      value: `${meta.purchasing_customers_90d}`,
      sub: 'local market activity, last 90 days',
    },
    {
      label: demandKindLabel,
      value: meta.open_primary_demand_kind === 'none' ? '—' : formatNumberValue(meta.open_primary_demand_value, 'CURRENCY_THRESHOLD'),
      sub:
        meta.open_primary_demand_kind === 'none'
          ? 'Enable Estimates or Sales Orders'
          : `${meta.open_primary_demand_count} open · current`,
    },
  ];

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Locations', href: '/locations' },
          { label: data.name, current: true },
        ]}
        avatar={{ kind: 'brand', initials: data.initials, hue: 'teal' }}
        title={data.name}
        status={
          data.status === 'active' && data.is_active
            ? { label: 'Active', tone: 'success' }
            : { label: 'Inactive', tone: 'neutral' }
        }
        subtitle={[
          data.city || '—',
          'Branch',
          data.phone_number ?? 'No phone',
          `${data.associated_users.length} associated users`,
        ]}
        actions={
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setSheetOpen(true)}>
            <PencilIcon size={14} />
            Edit location
          </Button>
        }
      />

      <LocationProfileStrip phoneNumber={data.phone_number} status={data.status} users={data.associated_users} />

      <MetricGrid className="mt-6" showSupportingText tiles={tiles} />

      <DetailTabs
        tabs={tabs}
        active={activeTab}
        onChange={(value) => setTab(value as TabId)}
      />

      {showPerformanceTab && activeTab === 'performance' ? (
        <LocationPerformanceTab overview={data.overview} performanceCards={data.performance_cards} />
      ) : null}
      {activeTab === 'orders' ? <LocationOrdersTab locationId={id} /> : null}
      {activeTab === 'estimates' ? <LocationEstimatesTab locationId={id} /> : null}
      {activeTab === 'invoices' ? <LocationInvoicesTab locationId={id} /> : null}

      <LocationFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingLocation={editingLocation} />
    </PageWrap>
  );
}
