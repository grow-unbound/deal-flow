'use client';

import { Fragment, useMemo, useState } from 'react';
import { FilterBar, GrowthPill, LandingTable, StatusTag, EntityAvatar } from '@/components/seller/layout';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { useDetailTableInfiniteScroll } from '@/hooks/useDetailTableInfiniteScroll';
import { detailRowsTotal, flattenDetailRows, useBrandProductsDetail } from '@/hooks/useDetailTabSearch';
import { createProductStockStatusFilterGroup, productStockStatusLabel } from '@/lib/product-stock-status';
import { formatNumberValue } from '@/lib/utils';

type SortOption =
  | 'Sales · QTD (high → low)'
  | 'Sales · QTD (low → high)'
  | 'Units trend (high → low)'
  | 'On hand (low → high)';

interface BrandProductsTabProps {
  brandId: string;
}

const SORT_OPTIONS: SortOption[] = [
  'Sales · QTD (high → low)',
  'Sales · QTD (low → high)',
  'Units trend (high → low)',
  'On hand (low → high)',
];

const TABLE_COLUMN_COUNT = 9;

function getInitials(name: string): string {
  return String(name)
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toLabelCase(input: string): string {
  return input
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function sortToApi(sortBy: SortOption): string {
  if (sortBy === 'Sales · QTD (low → high)') return 'sales_qtd_asc';
  if (sortBy === 'Units trend (high → low)') return 'units_qtd_trend_desc';
  if (sortBy === 'On hand (low → high)') return 'on_hand_asc';
  return 'sales_qtd_desc';
}

export function BrandProductsTab({ brandId }: BrandProductsTabProps) {
  const [search, setSearch] = useState('');
  const [stockStatuses, setStockStatuses] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('Sales · QTD (high → low)');

  const debouncedSearch = useDebounce(search, 300);
  const query = useBrandProductsDetail(brandId, {
    query: debouncedSearch,
    sort: sortToApi(sortBy),
    params: { stock: stockStatuses },
  });
  const products = useMemo(() => flattenDetailRows(query.data), [query.data]);
  const total = detailRowsTotal(query.data);
  const showTableSkeleton = query.isPending && products.length === 0;
  const { sentinelIndex, sentinelRef } = useDetailTableInfiniteScroll({
    itemCount: products.length,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => query.fetchNextPage(),
  });

  const stockFilterGroup = createProductStockStatusFilterGroup(stockStatuses, setStockStatuses);

  return (
    <section className="mt-5 min-w-0 max-w-full">
      <FilterBar
        count={`${total} product${total !== 1 ? 's' : ''}`}
        searchPlaceholder="Search product, SKU, category…"
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
        <LandingTableRowsSkeleton columns={TABLE_COLUMN_COUNT} tableMinWidth={1400} />
      ) : (
        <LandingTable
          horizontalScrollOnly
          columns={[
            { label: 'Product', width: 340, className: 'px-5' },
            { label: 'MRP', align: 'right', className: 'px-5' },
            { label: 'Base selling', align: 'right', className: 'px-5' },
            { label: 'Cost price', align: 'right', className: 'px-5' },
            { label: 'On hand', align: 'right', className: 'px-5' },
            { label: 'Days cover', align: 'right', className: 'px-5' },
            { label: 'Units sold QTD', align: 'right', className: 'px-5' },
            { label: 'Sales · QTD', align: 'right', className: 'px-5' },
            { label: 'Status', className: 'px-5' },
          ]}
          tableMinWidth={1400}
          showEmptyState={!query.isPending && products.length === 0}
          emptyState={
            <div className="py-16 text-center text-sm text-cream-500">
              {search.trim() || stockStatuses.length > 0 ? 'No products match these filters.' : 'No products in this brand yet.'}
            </div>
          }
        >
          {products.map((product, index) => {
            const onHand = Number(product.on_hand ?? 0);
            const daysCover = Number(product.days_cover ?? 0);
            const sku = product.sku;
            const category = product.category_name;
            const outOfStock = product.out_of_stock ?? onHand <= 0;
            const lowStock = product.low_stock ?? (daysCover < 14 && onHand > 0);
            const isIdle = product.is_idle ?? false;
            const { tone, label } = productStockStatusLabel({
              onHand,
              lowStock,
              outOfStock,
              isIdle,
            });

            return (
              <Fragment key={product.tenant_product_id}>
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
                      <EntityAvatar initials={getInitials(product.product_name)} hue="teal" imageUrl={product.image_url} size={38} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-cream-900">{product.product_name}</p>
                        <p className="mt-0.5 text-sm text-cream-700">
                          {sku} · {toLabelCase(category)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {product.mrp != null ? formatNumberValue(product.mrp, 'CURRENCY_EXACT') : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {product.base_selling_price != null ? formatNumberValue(product.base_selling_price, 'CURRENCY_EXACT') : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {product.cost_price != null ? formatNumberValue(product.cost_price, 'CURRENCY_EXACT') : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{onHand}</td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {daysCover === 0 ? (
                      <span className="font-semibold text-danger-700">0d</span>
                    ) : daysCover < 7 ? (
                      <span className="font-semibold text-warning-700">{daysCover}d</span>
                    ) : (
                      <span>{daysCover}d</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-base tabular-nums text-cream-900">
                        {product.units_qtd > 0 ? product.units_qtd : '—'}
                      </span>
                      {product.units_qtd_trend_pct != null ? <GrowthPill value={product.units_qtd_trend_pct} /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-display text-md font-medium tabular-nums text-cream-900">
                        {product.sales_qtd > 0 ? formatNumberValue(product.sales_qtd, 'CURRENCY_EXACT') : '—'}
                      </span>
                      {product.sales_qtd_trend_pct != null ? <GrowthPill value={product.sales_qtd_trend_pct} /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-base text-cream-900">
                    <StatusTag tone={tone} label={label} />
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
