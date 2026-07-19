'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityAvatar, FilterBar, LandingTable, type FilterBarGroup } from '@/components/seller/layout';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useDebounce } from '@/hooks/useDebounce';
import { useWarehouseStock } from '@/hooks/useWarehouses';
import type { WarehouseDetailInventoryItem } from '@/types/tenant-warehouses';

type StockSort = 'Product (A-Z)' | 'On hand (high → low)' | 'Reserved (high → low)' | 'Sellable (high → low)' | 'Reorder point (low → high)';

const STOCK_SORT_OPTIONS: StockSort[] = [
  'Product (A-Z)',
  'On hand (high → low)',
  'Reserved (high → low)',
  'Sellable (high → low)',
  'Reorder point (low → high)',
];

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

function stockStatusLabel(status: WarehouseDetailInventoryItem['stock_status']) {
  if (status === 'out_of_stock') return 'Out of stock';
  if (status === 'low_stock') return 'Low stock';
  return 'Clear';
}

function sortStockRows(rows: WarehouseDetailInventoryItem[], sortBy: StockSort) {
  return [...rows].sort((a, b) => {
    if (sortBy === 'On hand (high → low)') return b.qty_available - a.qty_available;
    if (sortBy === 'Reserved (high → low)') return b.qty_reserved - a.qty_reserved;
    if (sortBy === 'Sellable (high → low)') return b.sellable_units - a.sellable_units;
    if (sortBy === 'Reorder point (low → high)') {
      const aValue = a.reorder_point ?? Number.POSITIVE_INFINITY;
      const bValue = b.reorder_point ?? Number.POSITIVE_INFINITY;
      return aValue - bValue;
    }
    return a.product_name.localeCompare(b.product_name);
  });
}

interface WarehouseStockTabProps {
  warehouseId: string;
}

export function WarehouseStockTab({ warehouseId }: WarehouseStockTabProps) {
  const { state: routeState, setState: setRouteState } = useRouteSnapshot<{
    search: string;
    sortBy: StockSort;
    filters: { status: string[] };
  }>({
    storageKey: 'seller-warehouse-stock',
    scopeKey: warehouseId,
    initialState: {
      search: '',
      sortBy: 'Product (A-Z)',
      filters: { status: [] },
    },
  });

  const search = routeState.search ?? '';
  const sortBy = routeState.sortBy ?? 'Product (A-Z)';
  const statuses = routeState.filters?.status ?? [];
  const debouncedSearch = useDebounce(search, 300);
  const stockStatusValues = statuses.map((status) => status === 'Clear' ? 'clear' : status === 'Low stock' ? 'low_stock' : 'out_of_stock');
  const sortValue: Record<StockSort, string> = {
    'Product (A-Z)': 'product_asc',
    'On hand (high → low)': 'on_hand_desc',
    'Reserved (high → low)': 'reserved_desc',
    'Sellable (high → low)': 'sellable_desc',
    'Reorder point (low → high)': 'reorder_asc',
  };
  const stockQuery = useWarehouseStock(warehouseId, {
    query: debouncedSearch,
    statuses: stockStatusValues,
    sort: sortValue[sortBy],
  });
  const stock = stockQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = stockQuery.data?.pages[0]?.total ?? 0;
  const isTransitioning = stockQuery.isFetching || search !== debouncedSearch;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && stockQuery.hasNextPage && !stockQuery.isFetchingNextPage) {
        void stockQuery.fetchNextPage();
      }
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [stockQuery.hasNextPage, stockQuery.isFetchingNextPage, stockQuery.fetchNextPage]);

  const filterGroups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'Clear', label: 'Clear' },
        { value: 'Low stock', label: 'Low stock' },
        { value: 'Out of stock', label: 'Out of stock' },
      ],
      values: statuses,
      onChange: (values) => setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? { status: [] }), status: values },
      })),
    },
  ];

  const filtered = useMemo(() => {
    if (!isTransitioning) return stock;
    const needle = search.trim().toLowerCase();
    const filteredRows = stock.filter((item) => {
      const matchesSearch =
        !needle ||
        item.product_name.toLowerCase().includes(needle) ||
        item.brand_name.toLowerCase().includes(needle) ||
        item.sku.toLowerCase().includes(needle);
      const statusLabel = stockStatusLabel(item.stock_status);
      const matchesStatus = statuses.length === 0 || statuses.includes(statusLabel);
      return matchesSearch && matchesStatus;
    });

    return sortStockRows(filteredRows, sortBy);
  }, [isTransitioning, search, sortBy, statuses, stock]);

  return (
    <div className="mt-5">
      <FilterBar
        count={`${filtered.length} of ${total} SKUs${isTransitioning ? ' · Updating' : ''}`}
        searchPlaceholder="Search product, SKU, brand…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={filterGroups}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={[...STOCK_SORT_OPTIONS]}
        onSortChange={(value) => setRouteState((current) => ({ ...current, sortBy: value as StockSort }))}
      />

      <LandingTable
        columns={[
          { label: 'Product', width: 330, minWidth: 330, maxWidth: 420, className: 'px-5' },
          { label: 'Brand', width: 210, minWidth: 210, maxWidth: 260, className: 'px-5' },
          { label: 'On hand', align: 'center', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
          { label: 'Reserved', align: 'center', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
          { label: 'Sellable', align: 'center', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
          { label: 'Reorder point', align: 'center', width: 130, minWidth: 130, maxWidth: 160, className: 'px-5' },
        ]}
        tableMinWidth={1060}
        showEmptyState={filtered.length === 0}
        emptyState={
          <EmptyState
            icon={<Package size={28} strokeWidth={1.5} />}
            heading={search.trim() || statuses.length > 0 ? 'No matching stock rows' : 'No stock tracked in this warehouse yet'}
            description={
              search.trim() || statuses.length > 0
                ? 'Try a different search or filter combination.'
                : 'This warehouse will show stock rows once products are mapped to it.'
            }
            action={
              <Button variant="outline" size="sm" onClick={() => setRouteState({ search: '', sortBy: 'Product (A-Z)', filters: { status: [] } })}>
                Clear filters
              </Button>
            }
          />
        }
      >
        {filtered.map((item, index) => (
          <tr key={item.tenant_product_id} className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50">
            <td className="px-5 py-3.5 text-base text-cream-900">
              <div className="flex items-center gap-3">
                <EntityAvatar initials={getInitials(item.product_name)} hue={getHue(index)} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-cream-900">{item.product_name}</p>
                  <p className="mt-0.5 truncate text-sm text-cream-700">{item.sku}</p>
                </div>
              </div>
            </td>
            <td className="px-5 py-3.5 text-base text-cream-900">
              <div className="inline-flex items-center gap-2">
                <EntityAvatar initials={getInitials(item.brand_name)} hue={getHue(index + 1)} size={22} />
                <span className="text-sm text-cream-900">{item.brand_name}</span>
              </div>
            </td>
            <td className="px-5 py-3.5 text-center font-mono text-base tabular-nums text-cream-900">{item.qty_available.toLocaleString('en-IN')}</td>
            <td className="px-5 py-3.5 text-center font-mono text-base tabular-nums text-cream-900">{item.qty_reserved.toLocaleString('en-IN')}</td>
            <td className="px-5 py-3.5 text-center font-mono text-base tabular-nums text-cream-900">{item.sellable_units.toLocaleString('en-IN')}</td>
            <td className="px-5 py-3.5 text-center font-mono text-base tabular-nums text-cream-900">
              {item.reorder_point != null ? item.reorder_point.toLocaleString('en-IN') : '—'}
            </td>
          </tr>
          ))}
      </LandingTable>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-cream-600">
          Showing {filtered.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} SKUs
        </p>
        {stockQuery.isFetchingNextPage ? (
          <p className="text-sm text-cream-500">Loading…</p>
        ) : null}
      </div>
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
