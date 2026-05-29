'use client';

import { useMemo, useState } from 'react';
import { FilterBar, GrowthPill, LandingTable, StatusTag } from '@/components/seller/layout';
import { useTenantProducts } from '@/hooks/useProducts';
import { formatCompactInr } from '@/lib/utils';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)' | 'On hand (low → high)';

interface BrandProductsTabProps {
  brandId: string;
}

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)', 'On hand (low → high)'];

function toLabelCase(input: string): string {
  return input
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function BrandProductsTab({ brandId }: BrandProductsTabProps) {
  const { data } = useTenantProducts();
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All products');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');

  const products = useMemo(
    () => (data?.products ?? []).filter((product) => product.tenant_brand_id === brandId),
    [brandId, data?.products]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => {
        if (activeChip === 'Low stock') {
          return Number(product.on_hand ?? 0) > 0 && Number(product.days_cover ?? 0) < 14;
        }
        return true;
      })
      .filter((product) => {
        if (!query) return true;
        const sku = product.master_product?.master_sku ?? product.internal_sku;
        return (
          product.display_name.toLowerCase().includes(query) ||
          sku.toLowerCase().includes(query) ||
          (product.category_name ?? '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'GMV (high → low)') return Number(b.gmv_mtd ?? 0) - Number(a.gmv_mtd ?? 0);
        if (sortBy === 'GMV (low → high)') return Number(a.gmv_mtd ?? 0) - Number(b.gmv_mtd ?? 0);
        if (sortBy === 'Growth (high → low)') return Number(b.growth_pct ?? 0) - Number(a.growth_pct ?? 0);
        return Number(a.on_hand ?? 0) - Number(b.on_hand ?? 0);
      });
  }, [activeChip, products, search, sortBy]);

  return (
    <section className="mt-5">
      <FilterBar
        count={`${filtered.length} products`}
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
          const sku = product.master_product?.master_sku ?? product.internal_sku;
          const category = product.category_name ?? 'Uncategorized';
          const tone = product.status_tone ?? (onHand === 0 ? 'danger' : daysCover < 14 ? 'warning' : 'success');
          const label = product.status_label ?? (onHand === 0 ? 'Out of stock' : daysCover < 14 ? 'Low stock' : 'On pace');

          return (
            <tr
              key={product.id}
              className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
            >
              <td className="px-5 py-3.5 text-[13px] text-cream-900">
                <div className="ent flex items-center gap-3">
                  <div className="flex h-[38px] w-[38px] shrink-0 items-end justify-center rounded-[10px] bg-[linear-gradient(180deg,#EAF1EE_0%,#C6DAD3_100%)] pb-1">
                    <div className="h-[26px] w-[10px] rounded-[20%_20%_8%_8%/8%_8%_4%_4%] bg-[linear-gradient(180deg,#1F3A34,#142823)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-cream-900">{product.display_name}</p>
                    <p className="mt-0.5 text-[11.5px] text-cream-700">
                      {sku} · {toLabelCase(category)}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums text-cream-900">
                {product.mrp != null ? formatCompactInr(product.mrp) : '—'}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums text-cream-900">
                {product.base_selling_price != null ? formatCompactInr(product.base_selling_price) : '—'}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums text-cream-900">
                {product.cost_price != null ? formatCompactInr(product.cost_price) : '—'}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums text-cream-900">{onHand}</td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums text-cream-900">
                {daysCover === 0 ? (
                  <span className="font-semibold text-danger-700">0d</span>
                ) : daysCover < 7 ? (
                  <span className="font-semibold text-warning-700">{daysCover}d</span>
                ) : (
                  <span>{daysCover}d</span>
                )}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums text-cream-900">{unitsMtd}</td>
              <td className="px-5 py-3.5 text-right text-[13px] text-cream-900">
                <span className="font-display text-[15px] font-medium tabular-nums text-cream-900">{formatCompactInr(gmvMtd)}</span>
              </td>
              <td className="px-5 py-3.5 text-[13px] text-cream-900">
                <GrowthPill value={growthPct} />
              </td>
              <td className="px-5 py-3.5 text-[13px] text-cream-900">
                <StatusTag tone={tone} label={label} />
              </td>
            </tr>
          );
        })}
      </LandingTable>
    </section>
  );
}
