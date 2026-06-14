'use client';

import { useMemo, useState } from 'react';
import { EntityAvatar, FilterBar, LandingTable } from '@/components/seller/layout';
import type { PriceListItem } from '@/hooks/usePriceLists';
import type { PriceListFilterState } from '@/lib/zod';
import { cn, formatInr } from '@/lib/utils';

type ActiveChip = 'All products' | 'Discounted' | 'Above base';

type SortOption =
  | 'Product (A → Z)'
  | 'Brand (A → Z)'
  | 'List price (high → low)'
  | 'Discount % (high → low)'
  | 'Margin % (high → low)';

export interface PriceListProductsTabProps {
  filters: PriceListFilterState | null | undefined;
  items: PriceListItem[];
  brandsCovered: number;
}

function getInitials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PR';
}

function renderFilterValues(values: string[]) {
  return values.length > 0 ? values.join(', ') : '—';
}

export function PriceListProductsTab({ filters, items, brandsCovered }: PriceListProductsTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<ActiveChip>('All products');
  const [sortBy, setSortBy] = useState<SortOption>('Product (A → Z)');

  const brandNames = filters?.brand_names ?? [];
  const categoryNames = filters?.category_names ?? [];
  const hasSavedFilters = brandNames.length > 0 || categoryNames.length > 0;

  const rows = useMemo(() => {
    return items.map((item) => {
      const productName =
        item.tenant_product?.name_override ?? item.tenant_product?.master_product?.name ?? 'Unnamed';
      const brandName =
        item.tenant_product?.tenant_brand?.display_name_override ??
        item.tenant_product?.tenant_brand?.master_brand?.name ??
        '—';
      const base = Number(item.tenant_product?.base_selling_price ?? 0);
      const list = Number(item.price ?? 0);
      const mrp = item.tenant_product?.mrp ?? null;
      const cost = item.tenant_product?.cost_price ?? null;
      const discountPct = base > 0 ? ((base - list) / base) * 100 : null;
      const marginPct =
        list > 0 && cost != null && cost > 0 ? ((list - cost) / list) * 100 : null;
      return {
        item,
        productName,
        brandName,
        base,
        list,
        mrp,
        cost,
        discountPct,
        marginPct,
        sku: item.tenant_product?.internal_sku ?? '—',
      };
    });
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (activeChip === 'Discounted') return row.discountPct != null && row.discountPct > 0.0001;
        if (activeChip === 'Above base') return row.list > row.base;
        return true;
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.productName.toLowerCase().includes(q) ||
          row.brandName.toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'Brand (A → Z)') return a.brandName.localeCompare(b.brandName) || a.productName.localeCompare(b.productName);
        if (sortBy === 'List price (high → low)') return b.list - a.list;
        if (sortBy === 'Discount % (high → low)')
          return (b.discountPct ?? -Infinity) - (a.discountPct ?? -Infinity);
        if (sortBy === 'Margin % (high → low)')
          return (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity);
        return a.productName.localeCompare(b.productName);
      });
  }, [activeChip, rows, search, sortBy]);

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Filters applied</h3>
            <p className="mt-1 text-base text-cream-700">
              {items.length} products across {brandsCovered} brands.
            </p>
          </div>
        </div>

        {hasSavedFilters ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Brands</p>
              <p className="mt-1 text-base text-cream-900">{renderFilterValues(brandNames)}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Categories</p>
              <p className="mt-1 text-base text-cream-900">{renderFilterValues(categoryNames)}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            No saved filters. This price list was built from its saved line items only.
          </div>
        )}
      </article>

      <div>
        <FilterBar
          count={`${filtered.length} products`}
          searchPlaceholder="Search product, SKU, or brand…"
          chips={['All products', 'Discounted', 'Above base']}
          activeChip={activeChip}
          sortBy={sortBy}
          hideViewToggle
          searchValue={search}
          onSearchChange={setSearch}
          onChipChange={(chip) => setActiveChip(chip as ActiveChip)}
          sortOptions={[
            'Product (A → Z)',
            'Brand (A → Z)',
            'List price (high → low)',
            'Discount % (high → low)',
            'Margin % (high → low)',
          ]}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: 'Product', width: 280, className: 'px-5' },
            { label: 'Brand', className: 'px-5' },
            { label: 'Cost price', align: 'right', className: 'px-5' },
            { label: 'MRP', align: 'right', className: 'px-5' },
            { label: 'Base selling price', align: 'right', className: 'px-5' },
            { label: 'List price', align: 'right', className: 'px-5' },
            { label: 'Discount %', align: 'right', className: 'px-5' },
            { label: 'Margin %', align: 'right', className: 'px-5' },
          ]}
          className="rounded-[14px] border-t"
        >
          {filtered.map((row) => {
            const d = row.discountPct;
            const m = row.marginPct;
            return (
              <tr key={row.item.id} className="border-b border-cream-200 text-base">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <EntityAvatar initials={getInitials(row.productName)} hue="teal" size={32} className="rounded-[8px]" />
                    <div className="min-w-0">
                      <p className="ent-name truncate font-medium text-cream-950">{row.productName}</p>
                      <p className="mt-0.5 font-mono text-xs text-cream-600">{row.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <EntityAvatar initials={row.brandName.slice(0, 2).toUpperCase()} hue="cream" size={22} />
                    <span className="truncate">{row.brandName}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm text-cream-900">
                  {row.cost != null && row.cost > 0 ? formatInr(row.cost) : '—'}
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm text-cream-900">
                  {row.mrp != null ? formatInr(row.mrp) : '—'}
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm text-cream-700">{formatInr(row.base)}</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-cream-950">{formatInr(row.list)}</td>
                <td
                  className={cn(
                    'px-5 py-3 text-right font-mono text-sm',
                    d == null ? 'text-cream-500' : d >= 0 ? 'text-teal-700' : 'text-danger-700',
                  )}
                >
                  {d == null
                    ? '—'
                    : `${d >= 0 ? '-' : '+'}${Math.abs(d).toFixed(1)}%`}
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm text-cream-900">
                  {m == null ? '—' : `${m.toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </LandingTable>
      </div>
    </section>
  );
}
