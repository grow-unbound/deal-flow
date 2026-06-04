'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Upload } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  GrowthPill,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useTenantProducts, type TenantProduct, type TenantProductsResponse } from '@/hooks/useProducts';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

const AddProductSheet = dynamic(
  () => import('@/components/seller/products/AddProductSheet').then((m) => m.AddProductSheet),
  { ssr: false },
);

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)' | 'On hand (low → high)';

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)', 'On hand (low → high)'];

function getBrandHue(index: number): 'teal' | 'ember' | 'cream' {
  return (['teal', 'ember', 'cream'][index % 3] ?? 'cream') as 'teal' | 'ember' | 'cream';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((segment) => segment[0] ?? '')
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

function ProductLandingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-[36rem]" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[14px]" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-14 rounded-[14px]" />
        <Skeleton className="h-[28rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function ProductsLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: TenantProductsResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError, refetch } = useTenantProducts(period, initialData);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');
  const [activeChip, setActiveChip] = useState('All brands');
  const [addProductOpen, setAddProductOpen] = useState(false);

  const brandChips = useMemo(() => ['All brands', ...(data?.brands ?? []), 'Low stock'], [data?.brands]);
  const products = useMemo(() => data?.products ?? [], [data?.products]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => {
        if (activeChip === 'Low stock') {
          return Number(product.on_hand ?? 0) > 0 && Number(product.days_cover ?? 0) < 14;
        }
        if (activeChip !== 'All brands') {
          return (product.brand_name ?? '').toLowerCase() === activeChip.toLowerCase();
        }
        return true;
      })
      .filter((product) => {
        if (!query) return true;
        const sku = product.master_product?.master_sku ?? product.internal_sku;
        return (
          product.display_name.toLowerCase().includes(query) ||
          sku.toLowerCase().includes(query) ||
          (product.brand_name ?? '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'GMV (high → low)') return Number(b.gmv_mtd ?? 0) - Number(a.gmv_mtd ?? 0);
        if (sortBy === 'GMV (low → high)') return Number(a.gmv_mtd ?? 0) - Number(b.gmv_mtd ?? 0);
        if (sortBy === 'Growth (high → low)') return Number(b.growth_pct ?? 0) - Number(a.growth_pct ?? 0);
        return Number(a.on_hand ?? 0) - Number(b.on_hand ?? 0);
      });
  }, [activeChip, products, search, sortBy]);

  if (isLoading) return <ProductLandingSkeleton />;

  if (isError) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load products"
          description="There was a problem fetching your products. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }

  const kpis = data?.kpis;
  const total = kpis?.total_skus ?? products.length;
  const outOfStock = kpis?.out_of_stock ?? products.filter((p) => Number(p.on_hand ?? 0) === 0).length;
  const lowStock =
    kpis?.low_stock ?? products.filter((p) => Number(p.on_hand ?? 0) > 0 && Number(p.days_cover ?? 0) < 14).length;
  const growth = kpis?.revenue_growth_pct ?? 0;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        subtitle={`${total} SKUs across ${(data?.brands ?? []).length} brands. ${outOfStock} out of stock, ${lowStock} running low — those are the ones to chase this week.`}
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        secondary={{
          label: 'Bulk import',
          icon: <Upload size={13} />,
          onClick: () => router.push('/products/import'),
        }}
        primary="Add a product"
        onPrimaryClick={() => setAddProductOpen(true)}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Active SKUs',
            value: `${kpis?.active_skus ?? products.length}`,
            sub: `${kpis?.total_skus ?? products.length} total · ${kpis?.archived_skus ?? 0} archived`,
          },
          {
            label: 'Out of stock',
            value: `${outOfStock}`,
            sub: 'replenish urgently',
            tone: 'warn',
          },
          {
            label: 'Low stock',
            value: `${lowStock}`,
            sub: '< 14 days of cover',
          },
          {
            label: `Revenue · ${metricSuffix}`,
            value: formatCompactInr(kpis?.revenue_mtd ?? 0),
            sub: `${growth >= 0 ? '↑ +' : '↓ '}${Math.abs(growth)}% vs last month`,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs attention',
            hint: `${data?.todays_read?.needs_attention?.length ?? 0}`,
            rows: (data?.todays_read?.needs_attention ?? []).map((row) => ({
              initials: row.brand_initials,
              hue: row.brand_hue,
              name: row.name,
              reason: `${row.status.label} · ${row.on_hand} on hand · ${row.days_cover}d cover`,
              trailing: <GrowthPill value={row.growth_pct} />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top performers',
            hint: 'by GMV',
            rows: (data?.todays_read?.top_performers ?? []).map((row) => ({
              initials: row.brand_initials,
              hue: row.brand_hue,
              name: row.name,
              reason: `${row.units_mtd} units · ${row.brand}`,
              trailing: formatCompactInr(row.gmv_mtd),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: (data?.todays_read?.top_risers ?? []).map((row) => ({
              initials: row.brand_initials,
              hue: row.brand_hue,
              name: row.name,
              reason: `${row.brand} · ${formatCompactInr(row.gmv_mtd)} ${metricSuffix}`,
              trailing: <GrowthPill value={row.growth_pct} />,
            })),
          },
        ]}
      />

      <FilterBar
        count={`Showing ${filtered.length} of ${total}`}
        searchPlaceholder="Search product, SKU, brand…"
        chips={brandChips}
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
          { label: 'Brand', className: 'px-5' },
          { label: 'On hand', align: 'right', className: 'px-5' },
          { label: 'Days cover', align: 'right', className: 'px-5' },
          { label: `Units · ${metricSuffix}`, align: 'right', className: 'px-5' },
          { label: 'Revenue', align: 'right', className: 'px-5' },
          { label: 'Growth', className: 'px-5' },
          { label: 'Status', className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
      >
        {filtered.map((product: TenantProduct, index: number) => {
          const brandName = product.brand_name ?? 'Unknown brand';
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
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/products/${product.id}`)}
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
              <td className="px-5 py-3.5 text-[13px] text-cream-900">
                <div className="inline-flex items-center gap-2">
                  <EntityAvatar initials={getInitials(brandName)} hue={getBrandHue(index)} size={22} />
                  <span className="text-[12.5px] text-cream-900">{brandName}</span>
                </div>
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
              <td className="px-4 py-3.5 text-right text-[16px] text-cream-500">›</td>
            </tr>
          );
        })}
      </LandingTable>

      <AddProductSheet open={addProductOpen} onOpenChange={setAddProductOpen} hideTrigger />
    </PageWrap>
  );
}

export function ProductsLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: TenantProductsResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <ProductsLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
