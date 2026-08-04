'use client';

import { useMemo, useState } from 'react';
import { FilterBar, GrowthPill, LandingTable, StatusTag, EntityAvatar } from '@/components/seller/layout';
import { useDebounce } from '@/hooks/useDebounce';
import { detailRowsTotal, flattenDetailRows, useBrandProductsDetail } from '@/hooks/useDetailTabSearch';
import { formatNumberValue } from '@/lib/utils';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)' | 'On hand (low → high)';

interface BrandProductsTabProps {
  brandId: string;
}

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)', 'On hand (low → high)'];

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

export function BrandProductsTab({ brandId }: BrandProductsTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All products');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');

  const debouncedSearch = useDebounce(search, 300);
  const stock = activeChip === 'Low stock' ? 'low_stock' : null;
  const sort = sortBy === 'GMV (low → high)' ? 'gmv_asc' : sortBy === 'Growth (high → low)' ? 'growth_desc' : sortBy === 'On hand (low → high)' ? 'on_hand_asc' : 'gmv_desc';
  const query = useBrandProductsDetail(brandId, { query: debouncedSearch, filter: stock, sort });
  const products = useMemo(() => flattenDetailRows(query.data), [query.data]);
  const isInterim = search.trim() !== debouncedSearch.trim() || query.isFetching;

  const filtered = useMemo(() => {
    if (!isInterim) return products;
    const localQuery = search.trim().toLowerCase();
    return products
      .filter((product) => {
        if (activeChip === 'Low stock') {
          return Number(product.on_hand ?? 0) > 0 && Number(product.days_cover ?? 0) < 14;
        }
        return true;
      })
      .filter((product) => {
        if (!localQuery) return true;
        const sku = product.sku;
        return (
          product.product_name.toLowerCase().includes(localQuery) ||
          sku.toLowerCase().includes(localQuery) ||
          product.category_name.toLowerCase().includes(localQuery)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'GMV (high → low)') return Number(b.gmv_mtd ?? 0) - Number(a.gmv_mtd ?? 0);
        if (sortBy === 'GMV (low → high)') return Number(a.gmv_mtd ?? 0) - Number(b.gmv_mtd ?? 0);
        if (sortBy === 'Growth (high → low)') return Number(b.growth_pct ?? 0) - Number(a.growth_pct ?? 0);
        return Number(a.on_hand ?? 0) - Number(b.on_hand ?? 0);
      });
  }, [activeChip, isInterim, products, search, sortBy]);

  return (
    <section className="mt-5">
      <FilterBar
        count={`${isInterim ? filtered.length : detailRowsTotal(query.data)} products${query.isFetching ? ' · Updating' : ''}`}
        searchPlaceholder="Search product, SKU, category…"
        chips={['All products', 'Low stock']}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={setActiveChip}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />

      <LandingTable
        columns={[
          { label: 'Product', width: 340, className: 'px-5' },
          { label: 'MRP', align: 'right', className: 'px-5' },
          { label: 'Base selling', align: 'right', className: 'px-5' },
          { label: 'Cost price', align: 'right', className: 'px-5' },
          { label: 'On hand', align: 'right', className: 'px-5' },
          { label: 'Days cover', align: 'right', className: 'px-5' },
          { label: 'Units · MTD', align: 'right', className: 'px-5' },
          { label: 'Revenue', align: 'right', className: 'px-5' },
          { label: 'Growth', className: 'px-5' },
          { label: 'Status', className: 'px-5' },
        ]}
      >
        {filtered.map((product) => {
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = Number(product.days_cover ?? 0);
          const unitsMtd = Number(product.units_mtd ?? 0);
          const gmvMtd = Number(product.gmv_mtd ?? 0);
          const growthPct = Number(product.growth_pct ?? 0);
          const sku = product.sku;
          const category = product.category_name;
          const tone = onHand === 0 ? 'danger' : daysCover < 14 ? 'warning' : 'success';
          const label = onHand === 0 ? 'Out of stock' : daysCover < 14 ? 'Low stock' : 'On pace';

          return (
            <tr
              key={product.tenant_product_id}
              className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
            >
              <td className="px-3 py-3 text-base text-cream-900">
                <div className="ent flex items-center gap-3">
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
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{unitsMtd}</td>
              <td className="px-3 py-3 text-right text-base text-cream-900">
                <span className="font-display text-md font-medium tabular-nums text-cream-900">{formatNumberValue(gmvMtd, 'CURRENCY_EXACT')}</span>
              </td>
              <td className="px-3 py-3 text-base text-cream-900">
                <GrowthPill value={growthPct} />
              </td>
              <td className="px-3 py-3 text-base text-cream-900">
                <StatusTag tone={tone} label={label} />
              </td>
            </tr>
          );
        })}
      </LandingTable>
      {query.hasNextPage ? <button type="button" className="mt-4 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more'}</button> : null}
    </section>
  );
}
