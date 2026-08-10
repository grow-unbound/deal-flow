'use client';

import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { MetricGrid } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventoryByProduct, useWarehouses } from '@/hooks/useInventory';
import { formatNumberValue } from '@/lib/utils';

interface ProductStockTabProps {
  productId: string;
}

interface WarehouseStockRow {
  warehouseId: string;
  name: string;
  isDefault: boolean;
  qtyAvailable: number;
  qtyReserved: number;
}

export function ProductStockTab({ productId }: ProductStockTabProps) {
  const {
    data: warehousesData,
    isLoading: warehousesLoading,
    isError: warehousesError,
  } = useWarehouses();
  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    isError: inventoryError,
  } = useInventoryByProduct(productId);

  const rows = useMemo((): WarehouseStockRow[] => {
    const warehouses = warehousesData?.warehouses ?? [];
    const inventoryByWarehouse = new Map(
      (inventoryData?.inventory ?? []).map((row) => [row.warehouse_id, row]),
    );

    return [...warehouses]
      .map((warehouse) => {
        const inventory = inventoryByWarehouse.get(warehouse.id);
        return {
          warehouseId: warehouse.id,
          name: warehouse.name,
          isDefault: warehouse.is_default,
          qtyAvailable: inventory?.qty_available ?? 0,
          qtyReserved: inventory?.qty_reserved ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [inventoryData?.inventory, warehousesData?.warehouses]);

  const stockOnHand = useMemo(
    () => rows.reduce((sum, row) => sum + row.qtyAvailable, 0),
    [rows],
  );

  const isLoading = (warehousesLoading || inventoryLoading) && rows.length === 0;
  const isError = warehousesError || inventoryError;

  if (isError) {
    return (
      <ErrorState
        heading="Couldn't load stock"
        description="There was a problem fetching warehouse inventory for this product."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="mt-5 space-y-4">
        <Skeleton className="h-28 w-full max-w-sm rounded-[14px]" />
        <Skeleton className="h-64 w-full rounded-[14px]" />
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <MetricGrid
        className="mt-0 max-w-sm"
        showSupportingText
        tiles={[
          {
            label: 'Stock on hand',
            value: formatNumberValue(stockOnHand, 'COUNT'),
            sub: `${rows.length} warehouse${rows.length === 1 ? '' : 's'}`,
          },
        ]}
      />

      <section className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="flex items-center justify-between border-b border-cream-300 px-4 py-3">
          <h2 className="font-display text-lg text-cream-950">Warehouses</h2>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream-200">
              <MapPin size={24} className="text-cream-500" />
            </span>
            <p className="mb-1 font-display text-lg text-cream-900">No warehouses yet</p>
            <p className="max-w-sm text-sm text-cream-600">
              Configure warehouses to track on-hand stock by location.
            </p>
          </div>
        ) : (
          <div className="p-5">
            <table className="w-full text-base">
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.warehouseId}
                    className={index < rows.length - 1 ? 'border-b border-cream-200' : undefined}
                  >
                    <td className="w-64 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {row.name}
                        {row.isDefault ? (
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-teal-700">
                            Default
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2 font-mono tabular-nums text-cream-900">
                      {formatWarehouseStockValue(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatWarehouseStockValue(row: WarehouseStockRow): string {
  return formatNumberValue(row.qtyAvailable, 'COUNT');
}
