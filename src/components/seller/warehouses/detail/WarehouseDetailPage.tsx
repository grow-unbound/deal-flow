'use client';

import { useState } from 'react';
import { PencilIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailHeader, DetailTabs, MetricGrid } from '@/components/seller/detail';
import { PageWrap } from '@/components/seller/layout';
import { WarehouseFormSheet } from '@/components/seller/warehouses/WarehouseFormSheet';
import { WarehouseDetailsTab } from './WarehouseDetailsTab';
import { WarehouseStockTab } from './WarehouseStockTab';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useWarehouseDetail, useWarehouseReference } from '@/hooks/useWarehouses';
import type { TenantWarehouse } from '@/types/tenant-warehouses';
import { WarehouseDetailSkeleton as SharedWarehouseDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type TabId = 'details' | 'stock';

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
  const { state: rawTab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-warehouse-detail',
    scopeKey: id,
    initialState: 'details',
  });
  const tab: TabId = rawTab === 'stock' ? 'stock' : 'details';
  const { data, isLoading, isError, refetch } = useWarehouseDetail(id);
  const { data: editingWarehouse } = useWarehouseReference(id);

  if (isLoading) return <SharedWarehouseDetailSkeleton />;
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
          `${data.linked_location?.associated_users.length ? data.linked_location.associated_users.length : data.associated_users.length} associated users`,
        ]}
        actions={
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setSheetOpen(true)}>
            <PencilIcon size={14} />
            Edit warehouse
          </Button>
        }
      />

      <MetricGrid
        className="mt-6"
        showSupportingText
        tiles={[
          {
            label: 'Products in stock',
            value: `${data.meta_strip.tracked_skus}`,
            sub: `${data.details.stockout_skus} stockout SKUs`,
          },
          {
            label: 'Sellable units',
            value: data.meta_strip.sellable_units.toLocaleString('en-IN'),
            sub: 'available to fulfill',
          },
          {
            label: 'Stock risk SKUs',
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
          { id: 'stock', label: 'Stock', badge: data.tracked_skus_count || undefined },
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'details' ? <WarehouseDetailsTab data={data} /> : null}
      {tab === 'stock' ? <WarehouseStockTab warehouseId={id} /> : null}

      <WarehouseFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingWarehouse={warehouseForEdit} />
    </PageWrap>
  );
}
