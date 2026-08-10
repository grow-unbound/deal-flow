'use client';

import { Fragment, useMemo } from 'react';
import { formatNumberValue } from '@/lib/utils';
import { Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityAvatar, FilterBar, LandingTable } from '@/components/seller/layout';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useDebounce } from '@/hooks/useDebounce';
import { useDetailTableInfiniteScroll } from '@/hooks/useDetailTableInfiniteScroll';
import { useWarehouseStock } from '@/hooks/useWarehouses';
import { createProductStockStatusFilterGroup } from '@/lib/product-stock-status';

type StockSort = 'Product (A-Z)' | 'On hand (high → low)' | 'Reserved (high → low)' | 'Sellable (high → low)' | 'Reorder point (low → high)';

const STOCK_SORT_OPTIONS: StockSort[] = [
  'Product (A-Z)',
  'On hand (high → low)',
  'Reserved (high → low)',
  'Sellable (high → low)',
  'Reorder point (low → high)',
];

const TABLE_COLUMN_COUNT = 6;

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'SK';
}

function getHue(index: number): 'teal' | 'ember' | 'cream' {
  return (['teal', 'ember', 'cream'][index % 3] ?? 'cream') as 'teal' | 'ember' | 'cream';
}

function normalizeStockStatus(value: string): string {
  if (value === 'Low stock') return 'low_stock';
  if (value === 'Out of stock') return 'out_of_stock';
  return value;
}

interface WarehouseStockTabProps {
  warehouseId: string;
}

export function WarehouseStockTab({ warehouseId }: WarehouseStockTabProps) {
  const { state: routeState, setState: setRouteState } = useRouteSnapshot<{
    search: string;
    sortBy: StockSort;
    filters: { stock: string[] };
  }>({
    storageKey: 'seller-warehouse-stock',
    scopeKey: warehouseId,
    initialState: {
      search: '',
      sortBy: 'Product (A-Z)',
      filters: { stock: [] },
    },
  });

  const search = routeState.search ?? '';
  const sortBy = routeState.sortBy ?? 'Product (A-Z)';
  const legacyStatuses = (routeState.filters as { status?: string[] } | undefined)?.status;
  const rawStatuses = routeState.filters?.stock ?? legacyStatuses ?? [];
  const stockStatuses = rawStatuses.map(normalizeStockStatus);
  const debouncedSearch = useDebounce(search, 300);
  const sortValue: Record<StockSort, string> = {
    'Product (A-Z)': 'product_asc',
    'On hand (high → low)': 'on_hand_desc',
    'Reserved (high → low)': 'reserved_desc',
    'Sellable (high → low)': 'sellable_desc',
    'Reorder point (low → high)': 'reorder_asc',
  };
  const stockQuery = useWarehouseStock(warehouseId, {
    query: debouncedSearch,
    statuses: stockStatuses,
    sort: sortValue[sortBy],
  });
  const stock = useMemo(() => stockQuery.data?.pages.flatMap((page) => page.items) ?? [], [stockQuery.data]);
  const total = stockQuery.data?.pages[0]?.total ?? 0;
  const showTableSkeleton = stockQuery.isPending && stock.length === 0;
  const { sentinelIndex, sentinelRef } = useDetailTableInfiniteScroll({
    itemCount: stock.length,
    hasNextPage: stockQuery.hasNextPage,
    isFetchingNextPage: stockQuery.isFetchingNextPage,
    fetchNextPage: () => stockQuery.fetchNextPage(),
  });

  const stockFilterGroup = createProductStockStatusFilterGroup(stockStatuses, (values) =>
    setRouteState((current) => ({
      ...current,
      filters: { stock: values },
    })),
  );

  return (
    <div className="mt-5 min-w-0 max-w-full">
      <FilterBar
        count={`${total} SKU${total !== 1 ? 's' : ''}`}
        searchPlaceholder="Search product, SKU, brand…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={[stockFilterGroup]}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={[...STOCK_SORT_OPTIONS]}
        onSortChange={(value) => setRouteState((current) => ({ ...current, sortBy: value as StockSort }))}
      />

      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={TABLE_COLUMN_COUNT} tableMinWidth={1060} />
      ) : (
        <LandingTable
          horizontalScrollOnly
          columns={[
            { label: 'Product', width: 330, minWidth: 330, maxWidth: 420, className: 'px-5' },
            { label: 'Brand', width: 210, minWidth: 210, maxWidth: 260, className: 'px-5' },
            { label: 'On hand', align: 'center', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
            { label: 'Reserved', align: 'center', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
            { label: 'Sellable', align: 'center', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
            { label: 'Reorder point', align: 'center', width: 130, minWidth: 130, maxWidth: 160, className: 'px-5' },
          ]}
          tableMinWidth={1060}
          showEmptyState={!stockQuery.isPending && stock.length === 0}
          emptyState={
            <EmptyState
              icon={<Package size={28} strokeWidth={1.5} />}
              heading={search.trim() || stockStatuses.length > 0 ? 'No matching stock rows' : 'No stock tracked in this warehouse yet'}
              description={
                search.trim() || stockStatuses.length > 0
                  ? 'Try a different search or filter combination.'
                  : 'This warehouse will show stock rows once products are mapped to it.'
              }
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRouteState({ search: '', sortBy: 'Product (A-Z)', filters: { stock: [] } })}
                >
                  Clear filters
                </Button>
              }
            />
          }
        >
          {stock.map((item, index) => (
            <Fragment key={item.tenant_product_id}>
              {index === sentinelIndex ? (
                <tr aria-hidden="true" style={{ height: 0 }}>
                  <td colSpan={TABLE_COLUMN_COUNT} className="p-0">
                    <div ref={sentinelRef} />
                  </td>
                </tr>
              ) : null}
              <tr className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50">
                <td className="px-3 py-3 text-base text-cream-900">
                  <div className="flex items-center gap-3">
                    <EntityAvatar initials={getInitials(item.product_name)} hue={getHue(index)} imageUrl={item.image_url} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-cream-900">{item.product_name}</p>
                      <p className="mt-0.5 truncate text-sm text-cream-700">{item.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-base text-cream-900">
                  <div className="inline-flex items-center gap-2">
                    <EntityAvatar initials={getInitials(item.brand_name)} hue={getHue(index + 1)} size={22} />
                    <span className="text-sm text-cream-900">{item.brand_name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center font-mono text-base tabular-nums text-cream-900">
                  {formatNumberValue(item.qty_available, 'COUNT')}
                </td>
                <td className="px-3 py-3 text-center font-mono text-base tabular-nums text-cream-900">
                  {formatNumberValue(item.qty_reserved, 'COUNT')}
                </td>
                <td className="px-3 py-3 text-center font-mono text-base tabular-nums text-cream-900">
                  {formatNumberValue(item.sellable_units, 'COUNT')}
                </td>
                <td className="px-3 py-3 text-center font-mono text-base tabular-nums text-cream-900">
                  {item.reorder_point != null ? formatNumberValue(item.reorder_point, 'COUNT') : '—'}
                </td>
              </tr>
            </Fragment>
          ))}
        </LandingTable>
      )}
    </div>
  );
}
