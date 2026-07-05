'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { PageWrap } from '@/components/seller/layout';
import { WarehouseFormSheet } from '@/components/seller/warehouses/WarehouseFormSheet';
import { WarehouseDetailsTab } from './WarehouseDetailsTab';
import { WarehousePerformanceTab } from './WarehousePerformanceTab';
import { WarehouseStockTab } from './WarehouseStockTab';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useWarehouseDetail, useWarehouseReference, useWarehouseStock } from '@/hooks/useWarehouses';
import type { TenantWarehouse } from '@/types/tenant-warehouses';

type TabId = 'details' | 'performance' | 'stock';

function WarehouseDetailSkeleton() {
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
            <Skeleton className="h-9 w-28 rounded-[8px]" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[28rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

export function WarehouseDetailPage({ id }: { id: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-warehouse-detail',
    scopeKey: id,
    initialState: 'details',
  });
  const { data, isLoading, isError, refetch } = useWarehouseDetail(id);
  const { data: editingWarehouse } = useWarehouseReference(id);
  const stockQuery = useWarehouseStock(id, tab === 'stock');
  const stock = stockQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const stockTotal = stockQuery.data?.pages[0]?.total ?? data?.tracked_skus_count ?? 0;

  if (isLoading) return <WarehouseDetailSkeleton />;
  if (isError || !data) {
    return (
      <ErrorState
        heading="Couldn't load warehouse"
        description="There was a problem fetching this warehouse detail page."
        onRetry={() => refetch()}
      />
    );
  }

  const warehouseForEdit: TenantWarehouse = editingWarehouse ?? {
    id: data.id,
    tenant_id: '',
    location_id: data.linked_location?.id ?? null,
    name: data.name,
    address: data.address,
    phone_number: data.phone_number,
    status: data.status,
    is_default: data.is_default,
    external_ref: data.external_ref,
    associated_users: data.associated_users,
    lat: data.lat,
    lng: data.lng,
    deleted_at: null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    location: data.linked_location,
  };

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Warehouses', href: '/warehouses' },
          { label: data.name, current: true },
        ]}
        avatar={{ kind: 'brand', initials: data.initials, hue: 'teal' }}
        title={data.name}
        status={{
          label: data.status === 'active' ? 'Active' : 'Inactive',
          tone: data.status === 'active' ? 'success' : 'neutral',
        }}
        subtitle={[
          [data.city, data.state].filter(Boolean).join(', ') || '—',
          data.linked_location?.name ?? 'No linked location',
          data.phone_number ?? 'No phone',
          `${data.meta_strip.tracked_skus} tracked SKUs`,
          `${data.details.associated_users_count} associated users`,
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setSheetOpen(true)}>
            Edit warehouse
          </Button>
        }
      />

      <MetaStrip4
        tiles={[
          {
            label: 'Tracked SKUs',
            value: `${data.meta_strip.tracked_skus}`,
            sub: `${data.details.stockout_skus} stockout SKUs`,
          },
          {
            label: 'Sellable units',
            value: data.meta_strip.sellable_units.toLocaleString('en-IN'),
            sub: 'available to fulfill',
          },
          {
            label: 'Low-stock + stockout',
            value: `${data.meta_strip.low_stock_skus}`,
            sub: 'reorder-triggered exposure',
          },
          {
            label: 'Idle stock SKUs',
            value: `${data.meta_strip.idle_stock_skus}`,
            sub: 'no recent demand',
          },
        ]}
      />

      <DetailTabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'performance', label: 'Performance' },
          { id: 'stock', label: 'Stock', badge: data.tracked_skus_count || undefined },
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'details' ? <WarehouseDetailsTab data={data} /> : null}
      {tab === 'performance' ? <WarehousePerformanceTab data={data.performance} /> : null}
      {tab === 'stock' ? (
        <WarehouseStockTab
          stock={stock}
          total={stockTotal}
          hasMore={Boolean(stockQuery.hasNextPage)}
          isLoadingMore={stockQuery.isFetchingNextPage}
          onLoadMore={() => void stockQuery.fetchNextPage()}
        />
      ) : null}

      <WarehouseFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingWarehouse={warehouseForEdit} />
    </PageWrap>
  );
}
