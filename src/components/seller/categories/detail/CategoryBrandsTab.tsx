'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import { ChevronRight, Layers } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityAvatar, FilterBar, GrowthPill, LandingTable, StatusTag } from '@/components/seller/layout';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { useDetailTableInfiniteScroll } from '@/hooks/useDetailTableInfiniteScroll';
import {
  detailRowsTotal,
  flattenDetailRows,
  useCategoryBrandsDetail,
} from '@/hooks/useDetailTabSearch';
import { formatNumberValue } from '@/lib/utils';

interface CategoryBrandsTabProps {
  categoryId: string;
}

type SortOption = 'Sales · QTD (high → low)' | 'Name (A → Z)' | 'SKUs (high → low)' | 'Units sold QTD (high → low)';
const SORT_OPTIONS: SortOption[] = [
  'Sales · QTD (high → low)',
  'Name (A → Z)',
  'SKUs (high → low)',
  'Units sold QTD (high → low)',
];

const TABLE_COLUMN_COUNT = 8;

function sortToApi(sortBy: SortOption): string {
  if (sortBy === 'Name (A → Z)') return 'name_asc';
  if (sortBy === 'SKUs (high → low)') return 'sku_count_desc';
  if (sortBy === 'Units sold QTD (high → low)') return 'units_qtd_desc';
  return 'sales_qtd_desc';
}

export function CategoryBrandsTab({ categoryId }: CategoryBrandsTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('Sales · QTD (high → low)');
  const debouncedSearch = useDebounce(search, 300);

  const query = useCategoryBrandsDetail(categoryId, {
    query: debouncedSearch,
    sort: sortToApi(sortBy),
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

  return (
    <section className="mt-5">
      <FilterBar
        count={`${total} brand${total !== 1 ? 's' : ''}`}
        searchPlaceholder="Search brand…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />
      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={8} tableMinWidth={1200} />
      ) : (
        <LandingTable
          horizontalScrollOnly
          columns={[
            { label: 'Brand', minWidth: 240, className: 'px-5' },
            { label: 'SKUs', align: 'right', minWidth: 80, className: 'px-5' },
            { label: 'Sales · QTD', align: 'right', minWidth: 150, className: 'px-5' },
            { label: 'Units sold QTD', align: 'right', minWidth: 150, className: 'px-5' },
            { label: 'Demand · QTD', align: 'right', minWidth: 140, className: 'px-5' },
            { label: 'Demand units · QTD', align: 'right', minWidth: 160, className: 'px-5' },
            { label: 'Status', minWidth: 110, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1200}
          showEmptyState={!query.isPending && rows.length === 0}
          emptyState={
            <EmptyState
              icon={<Layers size={28} strokeWidth={1.5} />}
              heading={search.trim() ? 'No matching brands' : 'No brands in this category'}
              description={search.trim() ? 'Try a different search.' : 'Products assigned to this category will appear here.'}
            />
          }
        >
          {rows.map((b, index) => (
            <Fragment key={b.id}>
              {index === sentinelIndex ? (
                <tr aria-hidden="true" style={{ height: 0 }}>
                  <td colSpan={TABLE_COLUMN_COUNT} className="p-0">
                    <div ref={sentinelRef} />
                  </td>
                </tr>
              ) : null}
            <tr
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100"
              onClick={() => router.push(`/brands/${b.id}`)}
              onPointerDown={() => triggerHaptic()}
            >
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <EntityAvatar
                    initials={b.initials}
                    hue={b.is_active ? 'teal' : 'cream'}
                    imageUrl={b.logo_url}
                    size={38}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{b.name}</p>
                    <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.04em] text-cream-700">
                      {b.sku_count} SKU{b.sku_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                {b.sku_count}
              </td>
              <td className="px-3 py-3 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-display text-md font-medium tabular-nums text-cream-900">
                    {b.sales_qtd > 0 ? formatNumberValue(b.sales_qtd, 'CURRENCY_THRESHOLD') : '—'}
                  </span>
                  {b.sales_qtd_trend_pct != null ? <GrowthPill value={b.sales_qtd_trend_pct} /> : null}
                </div>
              </td>
              <td className="px-3 py-3 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono text-base tabular-nums text-cream-700">
                    {b.units_qtd > 0 ? formatNumberValue(b.units_qtd, 'COUNT') : '—'}
                  </span>
                  {b.units_qtd_trend_pct != null ? <GrowthPill value={b.units_qtd_trend_pct} /> : null}
                </div>
              </td>
              <td className="px-3 py-3 text-right">
                <span className="font-display text-md font-medium tabular-nums text-cream-900">
                  {b.demand_qtd_value > 0 ? formatNumberValue(b.demand_qtd_value, 'CURRENCY_THRESHOLD') : '—'}
                </span>
              </td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-700">
                {b.demand_qtd_units > 0 ? formatNumberValue(b.demand_qtd_units, 'COUNT') : '—'}
              </td>
              <td className="px-3 py-3">
                <StatusTag
                  tone={b.is_active ? 'success' : 'neutral'}
                  label={b.is_active ? 'Active' : 'Archived'}
                />
              </td>
              <td className="px-3 py-3 text-right text-cream-400">
                <ChevronRight size={16} />
              </td>
            </tr>
            </Fragment>
          ))}
        </LandingTable>
      )}
    </section>
  );
}
