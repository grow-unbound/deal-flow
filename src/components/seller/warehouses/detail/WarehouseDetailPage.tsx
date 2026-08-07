'use client';

import { formatNumberValue } from '@/lib/utils';
import { useState } from 'react';
import { PencilIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailHeader, DetailTabs } from '@/components/seller/detail';
import { InsightStrip4 } from '@/components/seller/layout';
import { WarehouseFormSheet } from '@/components/seller/warehouses/WarehouseFormSheet';
import { WarehouseDetailsTab } from './WarehouseDetailsTab';
import { WarehouseStockTab } from './WarehouseStockTab';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useWarehouseDetail, useWarehouseReference } from '@/hooks/useWarehouses';
import type { TenantWarehouse } from '@/types/tenant-warehouses';
import { WarehouseDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type TabId = 'details' | 'stock';

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

  if (isError || (!isLoading && !data)) {
    return (
      <ErrorState
        heading="Couldn't load warehouse"
        description="There was a problem fetching this warehouse detail page."
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading && !data) return <WarehouseDetailSkeleton />;

  const warehouseForEdit: TenantWarehouse | null =
    editingWarehouse ??
    (data
      ? {
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
        }
      : null);

  return (
    <div className="px-4 py-4 md:px-6 md:py-4">
      <DetailHeader
        loading={isLoading}
        avatar={{ kind: 'brand', initials: data?.initials ?? 'WH', hue: 'teal' }}
        title={data?.name ?? ''}
        status={{
          label: data?.status === 'active' ? 'Active' : 'Inactive',
          tone: data?.status === 'active' ? 'success' : 'neutral',
        }}
        subtitle={
          data
            ? [
                [data.city, data.state].filter(Boolean).join(', ') || '—',
                data.linked_location?.name ?? 'No linked location',
                data.phone_number ?? 'No phone',
                `${data.meta_strip.tracked_skus} tracked SKUs`,
                `${data.linked_location?.associated_users.length ? data.linked_location.associated_users.length : data.associated_users.length} associated users`,
              ]
            : []
        }
        actions={
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setSheetOpen(true)}>
            <PencilIcon size={14} />
            Edit warehouse
          </Button>
        }
      />

      {data ? (
        <InsightStrip4
          className="mt-6"
          showSupportingText
          tiles={[
            {
              label: 'Sales · QTD',
              value: formatNumberValue(data.meta_strip.sales_qtd_value, 'CURRENCY_THRESHOLD'),
            },
            {
              label: 'Products in stock',
              value: `${data.meta_strip.tracked_skus}`,
              sub: `${formatNumberValue(data.meta_strip.sellable_units, 'COUNT')} sellable units`,
            },
            {
              label: 'Low / out of stock',
              value: `${data.meta_strip.low_stock_skus} / ${data.meta_strip.out_of_stock_skus}`,
              sub: 'reorder-triggered exposure',
            },
            {
              label: 'Idle stock',
              value: `${data.meta_strip.idle_stock_skus}`,
              sub: `${formatNumberValue(data.meta_strip.idle_stock_units, 'COUNT')} units · no sales this quarter`,
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

      <DetailTabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'stock', label: 'Stock', badge: data?.tracked_skus_count || undefined },
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'details' ? (
        data ? <WarehouseDetailsTab data={data} /> : <Skeleton className="mt-4 h-[26rem] rounded-[14px]" />
      ) : null}
      {tab === 'stock' ? <WarehouseStockTab warehouseId={id} /> : null}

      <WarehouseFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingWarehouse={warehouseForEdit} />
    </div>
  );
}
