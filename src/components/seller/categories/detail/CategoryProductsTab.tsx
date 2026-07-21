'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Package } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityAvatar, FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import type { CategoryDetailProduct } from '@/hooks/useCategories';
import { formatNumberValue } from '@/lib/utils';

interface CategoryProductsTabProps {
  products: CategoryDetailProduct[];
  categoryId: string;
}

type SortOption = 'GMV (high → low)' | 'Name (A → Z)' | 'On hand (low → high)';
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'Name (A → Z)', 'On hand (low → high)'];

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

export function CategoryProductsTab({ products, categoryId: _categoryId }: CategoryProductsTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku_code ?? '').toLowerCase().includes(q) || p.brand_name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'Name (A → Z)') return a.name.localeCompare(b.name);
        if (sortBy === 'On hand (low → high)') return a.on_hand - b.on_hand;
        return b.gmv_mtd - a.gmv_mtd;
      });
  }, [products, search, sortBy]);

  return (
    <section className="mt-5">
      <FilterBar
        count={`${filtered.length} product${filtered.length !== 1 ? 's' : ''}`}
        searchPlaceholder="Search product or SKU…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />
      <LandingTable
        columns={[
          { label: 'Product', width: 400, minWidth: 380, className: 'px-5' },
          { label: 'Brand', width: 140, minWidth: 140, className: 'px-5' },
          { label: 'On hand', align: 'right', minWidth: 100, className: 'px-5' },
          { label: 'Days cover', align: 'right', minWidth: 110, className: 'px-5' },
          { label: 'Units · 90D', align: 'right', minWidth: 110, className: 'px-5' },
          { label: 'Revenue · 90D', align: 'right', minWidth: 130, className: 'px-5' },
          { label: 'Status', minWidth: 120, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1100}
        showEmptyState={filtered.length === 0}
        emptyState={
          <EmptyState
            icon={<Package size={28} strokeWidth={1.5} />}
            heading={search.trim() ? 'No matching products' : 'No products in this category'}
            description={search.trim() ? 'Try a different search.' : 'Assign products to this category from the Products settings page.'}
          />
        }
      >
        {filtered.map((p) => {
          const onHand = p.on_hand;
          const tone = onHand === 0 ? 'danger' : p.days_cover != null && p.days_cover < 14 ? 'warning' : 'success';
          const statusLabel = onHand === 0 ? 'Out of stock' : p.days_cover != null && p.days_cover < 14 ? 'Low stock' : 'On pace';
          return (
            <tr
              key={p.id}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/products/${p.id}`)}
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <EntityAvatar initials={getInitials(p.name)} hue="teal" size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{p.name}</p>
                    {p.sku_code ? <p className="mt-0.5 text-sm text-cream-700">{p.sku_code}</p> : null}
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <EntityAvatar initials={getInitials(p.brand_name)} hue="teal" imageUrl={p.brand_logo_url} size={22} />
                  <span className="text-sm text-cream-900">{p.brand_name}</span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right">
                {onHand <= 0 ? (
                  <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-700">OOS</span>
                ) : (
                  <span className="font-mono text-base tabular-nums text-cream-900">{onHand}</span>
                )}
              </td>
              <td className="px-5 py-3.5 text-right">
                <DaysCoverBadge value={p.days_cover == null ? null : Math.round(p.days_cover)} />
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-700">
                {p.units_mtd > 0 ? p.units_mtd : '—'}
              </td>
              <td className="px-5 py-3.5 text-right">
                <span className="font-display text-md font-medium tabular-nums text-cream-900">
                  {p.gmv_mtd > 0 ? formatNumberValue(p.gmv_mtd, 'CURRENCY_THRESHOLD') : '—'}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <StatusTag tone={tone} label={statusLabel} />
              </td>
              <td className="px-4 py-3.5 text-right text-cream-400">
                <ChevronRight size={16} />
              </td>
            </tr>
          );
        })}
      </LandingTable>
    </section>
  );
}
