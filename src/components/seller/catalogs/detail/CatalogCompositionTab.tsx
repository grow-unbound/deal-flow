import { useMemo, useState } from 'react';
import { EntityAvatar, FilterBar, LandingTable } from '@/components/seller/layout';
import type { CatalogDetailResponse } from '@/hooks/useCatalogs';
import { cn, formatInr, formatSalesInr } from '@/lib/utils';

type SortOption = 'Catalog order' | 'Brand (A → Z)' | 'Units sold MTD (high → low)' | 'Days cover (low → high)';

const AVAILABILITY_LABELS: Record<CatalogDetailResponse['products_summary']['filters']['availability'], string> = {
  new_in_stock_today: 'New In Stock today',
  in_stock_only: 'In Stock only',
  low_stock_only: 'Low Stock only',
  old_stock: 'Old Stock',
  show_everything: 'Show everything',
};

interface CatalogCompositionTabProps {
  summary: CatalogDetailResponse['products_summary'];
  rows: CatalogDetailResponse['products'];
}

function tagLabel(tag: CatalogDetailResponse['products'][number]['tag']) {
  if (tag === 'new') return 'NEW';
  if (tag === 'new_stock') return 'NEW STOCK';
  if (tag === 'old_stock') return 'OLD STOCK';
  return null;
}

function tagPillClasses(tag: CatalogDetailResponse['products'][number]['tag']) {
  if (tag === 'new' || tag === 'new_stock') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-cream-300 bg-cream-100 text-cream-700';
}

function renderFilterValue(values: string[]) {
  return values.length > 0 ? values.join(', ') : 'No saved filter';
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

export function CatalogCompositionTab({ summary, rows }: CatalogCompositionTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All products');
  const [sortBy, setSortBy] = useState<SortOption>('Catalog order');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (activeChip === 'In stock') return row.stock_tone === 'success';
        if (activeChip === 'Low stock') return row.stock_tone === 'warning';
        if (activeChip === 'Out of stock') return row.stock_tone === 'neutral';
        return true;
      })
      .filter((row) => {
        if (!query) return true;
        return (
          row.product_name.toLowerCase().includes(query) ||
          row.internal_sku.toLowerCase().includes(query) ||
          row.brand_name.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'Brand (A → Z)') return a.brand_name.localeCompare(b.brand_name) || a.product_name.localeCompare(b.product_name);
        if (sortBy === 'Units sold MTD (high → low)') return b.units_mtd - a.units_mtd;
        if (sortBy === 'Days cover (low → high)') return (a.days_cover ?? Number.POSITIVE_INFINITY) - (b.days_cover ?? Number.POSITIVE_INFINITY);
        return a.catalog_order - b.catalog_order;
      });
  }, [activeChip, rows, search, sortBy]);

  const hasNoSavedFilters =
    summary.filters.brand_names.length === 0 &&
    summary.filters.category_names.length === 0 &&
    summary.filters.availability === 'show_everything' &&
    summary.tag_overrides_count === 0;

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Filters applied</h3>
            <p className="mt-1 text-base text-cream-700">
              {summary.included_count} products selected across {summary.brands_covered} brands.
            </p>
          </div>
          <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">In stock</p>
            <p className="mt-1 font-display text-2xl leading-none text-cream-950">{summary.in_stock_count}</p>
          </div>
        </div>

        {hasNoSavedFilters ? (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            No saved filters. This catalog uses its manually selected product mix.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Brands</p>
              <p className="mt-1 text-base text-cream-900">{renderFilterValue(summary.filters.brand_names)}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Categories</p>
              <p className="mt-1 text-base text-cream-900">{renderFilterValue(summary.filters.category_names)}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Availability</p>
              <p className="mt-1 text-base text-cream-900">{AVAILABILITY_LABELS[summary.filters.availability]}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Tag overrides</p>
              <p className="mt-1 text-base text-cream-900">
                {summary.tag_overrides_count > 0 ? `${summary.tag_overrides_count} product tags customised` : 'No saved overrides'}
              </p>
            </div>
          </div>
        )}
      </article>

      <div>
        <FilterBar
          count={`${filtered.length} products`}
          searchPlaceholder="Search product, SKU, brand…"
          chips={['All products', 'In stock', 'Low stock', 'Out of stock']}
          activeChip={activeChip}
          sortBy={sortBy}
          hideViewToggle
          searchValue={search}
          onSearchChange={setSearch}
          onChipChange={setActiveChip}
          sortOptions={['Catalog order', 'Brand (A → Z)', 'Units sold MTD (high → low)', 'Days cover (low → high)']}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: 'Product Name', width: 320, className: 'px-5' },
            { label: 'Brand', className: 'px-5' },
            { label: 'GMV Sales', align: 'right', className: 'px-5' },
            { label: 'Units Sold', align: 'right', className: 'px-5' },
            { label: 'MRP', align: 'right', className: 'px-5' },
            { label: 'Catalog Price', align: 'right', className: 'px-5' },
            { label: 'Tag', align: 'right', className: 'px-5' },
          ]}
        >
          {filtered.map((row) => {
            const label = tagLabel(row.tag);
            const catalogPrice = row.override_price ?? row.base_selling_price;

            return (
              <tr key={row.tenant_product_id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
                <td className="px-5 py-3.5 text-cream-900">
                  <div className="flex items-center gap-3">
                    <EntityAvatar
                      initials={getInitials(row.product_name)}
                      hue={row.catalog_order % 3 === 1 ? 'ember' : row.catalog_order % 3 === 2 ? 'cream' : 'teal'}
                      size={32}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium">{row.product_name}</p>
                      <p className="mt-0.5 font-mono text-xs text-cream-700">{row.internal_sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-base text-cream-900">{row.brand_name}</td>
                <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{row.catalog_gmv > 0 ? formatSalesInr(row.catalog_gmv, 1) : '—'}</td>
                <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{row.catalog_units_sold}</td>
                <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{row.mrp != null ? formatInr(row.mrp) : '—'}</td>
                <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">
                  {catalogPrice != null ? formatInr(catalogPrice) : '—'}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {label ? (
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]', tagPillClasses(row.tag))}>
                      {label}
                    </span>
                  ) : (
                    <span className="text-base text-cream-500">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </LandingTable>
      </div>
    </section>
  );
}
