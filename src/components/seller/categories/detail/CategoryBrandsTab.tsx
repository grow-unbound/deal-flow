'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import { ChevronRight, Layers } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityAvatar, FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import type { CategoryDetailBrand } from '@/hooks/useCategories';
import { formatNumberValue } from '@/lib/utils';

interface CategoryBrandsTabProps {
  brands: CategoryDetailBrand[];
}

type SortOption = 'GMV (high → low)' | 'Name (A → Z)' | 'SKUs (high → low)';
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'Name (A → Z)', 'SKUs (high → low)'];

function getInitials(name: string): string {
  return String(name)
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function CategoryBrandsTab({ brands }: CategoryBrandsTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brands
      .filter((b) => !q || b.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'Name (A → Z)') return a.name.localeCompare(b.name);
        if (sortBy === 'SKUs (high → low)') return b.sku_count - a.sku_count;
        return b.gmv_mtd - a.gmv_mtd;
      });
  }, [brands, search, sortBy]);

  return (
    <section className="mt-5">
      <FilterBar
        count={`${filtered.length} brand${filtered.length !== 1 ? 's' : ''}`}
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
      <LandingTable
        columns={[
          { label: 'Brand', minWidth: 240, className: 'px-5' },
          { label: 'SKUs', align: 'right', minWidth: 80, className: 'px-5' },
          { label: 'Revenue · 90D', align: 'right', minWidth: 140, className: 'px-5' },
          { label: 'Units Sold · 90D', align: 'right', minWidth: 140, className: 'px-5' },
          { label: 'Demand · 90D', align: 'right', minWidth: 140, className: 'px-5' },
          { label: 'Demand Units · 90D', align: 'right', minWidth: 150, className: 'px-5' },
          { label: 'Status', minWidth: 110, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1100}
        showEmptyState={filtered.length === 0}
        emptyState={
          <EmptyState
            icon={<Layers size={28} strokeWidth={1.5} />}
            heading={search.trim() ? 'No matching brands' : 'No brands in this category'}
            description={search.trim() ? 'Try a different search.' : 'Products assigned to this category will appear here.'}
          />
        }
      >
        {filtered.map((b) => (
          <tr
            key={b.id}
            className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100"
            onClick={() => router.push(`/brands/${b.id}`)}
            onPointerDown={() => triggerHaptic()}
          >
            <td className="px-3 py-2">
              <div className="flex items-center gap-3">
                <EntityAvatar
                  initials={getInitials(b.name)}
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
            <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">
              {b.sku_count}
            </td>
            <td className="px-3 py-2 text-right">
              <span className="font-display text-md font-medium tabular-nums text-cream-900">
                {b.gmv_mtd > 0 ? formatNumberValue(b.gmv_mtd, 'CURRENCY_THRESHOLD') : '—'}
              </span>
            </td>
            <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-700">
              {b.units_90d > 0 ? formatNumberValue(b.units_90d, 'COUNT') : '—'}
            </td>
            <td className="px-3 py-2 text-right">
              <span className="font-display text-md font-medium tabular-nums text-cream-900">
                {b.demand_90d > 0 ? formatNumberValue(b.demand_90d, 'CURRENCY_THRESHOLD') : '—'}
              </span>
            </td>
            <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-700">
              {b.demand_units_90d > 0 ? formatNumberValue(b.demand_units_90d, 'COUNT') : '—'}
            </td>
            <td className="px-3 py-2">
              <StatusTag
                tone={b.is_active ? 'success' : 'neutral'}
                label={b.is_active ? 'Active' : 'Archived'}
              />
            </td>
            <td className="px-3 py-2 text-right text-cream-400">
              <ChevronRight size={16} />
            </td>
          </tr>
        ))}
      </LandingTable>
    </section>
  );
}
