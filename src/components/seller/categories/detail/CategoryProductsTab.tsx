'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import { ChevronRight, Package } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityAvatar, FilterBar, GrowthPill, LandingTable, StatusTag } from '@/components/seller/layout';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { useDetailTableInfiniteScroll } from '@/hooks/useDetailTableInfiniteScroll';
import {
  detailRowsTotal,
  flattenDetailRows,
  useCategoryProductsDetail,
} from '@/hooks/useDetailTabSearch';
import { createProductStockStatusFilterGroup, productStockStatusLabel } from '@/lib/product-stock-status';
import { formatNumberValue } from '@/lib/utils';

interface CategoryProductsTabProps {
  categoryId: string;
}

type SortOption = 'Sales · QTD (high → low)' | 'Name (A → Z)' | 'On hand (low → high)' | 'Units sold QTD (high → low)';
const SORT_OPTIONS: SortOption[] = [
  'Sales · QTD (high → low)',
  'Name (A → Z)',
  'On hand (low → high)',
  'Units sold QTD (high → low)',
];

const TABLE_COLUMN_COUNT = 8;

function getInitials(name: string): string {
  return String(name)
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function DaysCoverBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-cream-400">—</span>;
  if (value === 0) return <span className="font-semibold text-danger-700">0d</span>;
  if (value < 7) return <span className="font-semibold text-warning-700">{value}d</span>;
  return <span className="text-cream-700">{value}d</span>;
}

function sortToApi(sortBy: SortOption): string {
  if (sortBy === 'Name (A → Z)') return 'name_asc';
  if (sortBy === 'On hand (low → high)') return 'on_hand_asc';
  if (sortBy === 'Units sold QTD (high → low)') return 'units_qtd_desc';
  return 'sales_qtd_desc';
}

export function CategoryProductsTab({ categoryId }: CategoryProductsTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('Sales · QTD (high → low)');
  const [stockStatuses, setStockStatuses] = useState<string[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  const query = useCategoryProductsDetail(categoryId, {
    query: debouncedSearch,
    sort: sortToApi(sortBy),
    params: { stock: stockStatuses },
  });
  const rows = useMemo(() => flattenDetailRows(query.data), [query.data]);
  const total = detailRowsTotal(query.data);
  const showTableSkeleton = query.isPending && rows.length === 0;
  const { sentinelIndex, sentinelRef } = useDetailTableInfiniteScroll({
    itemCount: rows.length,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => query.fetchNextPage(),
  });

  const stockFilterGroup = createProductStockStatusFilterGroup(stockStatuses, setStockStatuses);

  return (
    <section className="mt-5 min-w-0 max-w-full">
      <FilterBar
        count={`${total} product${total !== 1 ? 's' : ''}`}
        searchPlaceholder="Search product or SKU…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={[stockFilterGroup]}
        searchValue={search}
        onSearchChange={setSearch}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />
      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={TABLE_COLUMN_COUNT} tableMinWidth={1200} />
      ) : (
        <LandingTable
          horizontalScrollOnly
          columns={[
            { label: 'Product', width: 400, minWidth: 380, className: 'px-5' },
            { label: 'Brand', width: 140, minWidth: 140, className: 'px-5' },
            { label: 'On hand', align: 'right', minWidth: 100, className: 'px-5' },
            { label: 'Days cover', align: 'right', minWidth: 110, className: 'px-5' },
            { label: 'Units sold · QTD', align: 'right', minWidth: 130, className: 'px-5' },
            { label: 'Sales · QTD', align: 'right', minWidth: 150, className: 'px-5' },
            { label: 'Status', minWidth: 120, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1200}
          showEmptyState={!query.isPending && rows.length === 0}
          emptyState={
            <EmptyState
              icon={<Package size={28} strokeWidth={1.5} />}
              heading={search.trim() || stockStatuses.length > 0 ? 'No matching products' : 'No products in this category'}
              description={search.trim() || stockStatuses.length > 0 ? 'Try a different search or filter.' : 'Assign products to this category from the Products settings page.'}
            />
          }
        >
          {rows.map((p, index) => {
            const onHand = p.on_hand;
            const lowStock = p.low_stock ?? (p.days_cover != null && p.days_cover < 14 && onHand > 0);
            const outOfStock = p.out_of_stock ?? onHand <= 0;
            const isIdle = p.is_idle ?? false;
            const { tone, label: statusLabel } = productStockStatusLabel({
              onHand,
              lowStock,
              outOfStock,
              isIdle,
            });
            return (
              <Fragment key={p.id}>
                {index === sentinelIndex ? (
                  <tr aria-hidden="true" style={{ height: 0 }}>
                    <td colSpan={TABLE_COLUMN_COUNT} className="p-0">
                      <div ref={sentinelRef} />
                    </td>
                  </tr>
                ) : null}
                <tr
                  className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100"
                  onClick={() => router.push(`/products/${p.id}`)}
                  onPointerDown={() => triggerHaptic()}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <EntityAvatar initials={getInitials(p.name)} hue="teal" imageUrl={p.image_url} size={38} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-cream-900">{p.name}</p>
                        {p.sku_code ? <p className="mt-0.5 text-sm text-cream-700">{p.sku_code}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <EntityAvatar initials={getInitials(p.brand_name)} hue="teal" imageUrl={p.brand_logo_url} size={22} />
                      <span className="text-sm text-cream-900">{p.brand_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {onHand <= 0 ? (
                      <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-700">OOS</span>
                    ) : (
                      <span className="font-mono text-base tabular-nums text-cream-900">{onHand}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <DaysCoverBadge value={p.days_cover == null ? null : Math.round(p.days_cover)} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-base tabular-nums text-cream-700">
                        {p.units_qtd > 0 ? p.units_qtd : '—'}
                      </span>
                      {p.units_qtd_trend_pct != null ? <GrowthPill value={p.units_qtd_trend_pct} /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-display text-md font-medium tabular-nums text-cream-900">
                        {p.sales_qtd > 0 ? formatNumberValue(p.sales_qtd, 'CURRENCY_THRESHOLD') : '—'}
                      </span>
                      {p.sales_qtd_trend_pct != null ? <GrowthPill value={p.sales_qtd_trend_pct} /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusTag tone={tone} label={statusLabel} />
                  </td>
                  <td className="px-3 py-3 text-right text-cream-400">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </LandingTable>
      )}
    </section>
  );
}
