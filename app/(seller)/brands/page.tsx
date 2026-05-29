'use client';

import { useEffect, useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import { AddBrandCommand } from '@/components/seller/brands/AddBrandCommand';
import { InviteUserDialog } from '@/components/seller/InviteUserDialog';
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
import { ErrorState, LoadingState } from '@/components/ui/empty-state';
import { useTenantBrands, type TenantBrand } from '@/hooks/useBrands';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { formatCompactInr } from '@/lib/utils';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)' | 'Catalog age (most recent)';

interface BrandVm {
  id: string;
  name: string;
  category: string;
  region: string;
  skus: number;
  gmv: number;
  gmvPrior: number;
  growth: number;
  share: number;
  activeBuyers: number;
  totalBuyers: number;
  daysSinceCatalog: number;
  catalogName: string | null;
  alerts: string[];
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
}

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)', 'Catalog age (most recent)'];
const PAGE_SIZE = 20;

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((segment) => segment[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toBrandVm(brand: TenantBrand, index: number): BrandVm {
  const name = brand.display_name_override ?? brand.master_brand?.name ?? 'Unknown brand';
  const gmv = brand.gmv_mtd ?? 0;
  const gmvPrior = brand.gmv_prev_mtd ?? 0;
  const growth = brand.growth_pct ?? (gmvPrior > 0 ? Math.round(((gmv - gmvPrior) / gmvPrior) * 100) : 0);
  const category = brand.categories?.[0] ?? 'Uncategorized';
  const alerts = brand.alerts ?? [];
  const daysSinceCatalog = brand.catalog_days_ago ?? 999;

  return {
    id: brand.id,
    name,
    category,
    region: 'Karnataka',
    skus: brand.sku_count ?? 0,
    gmv,
    gmvPrior,
    growth,
    share: 0,
    activeBuyers: brand.active_buyers_mtd ?? 0,
    totalBuyers: brand.total_buyers ?? 0,
    daysSinceCatalog,
    catalogName: brand.catalog_name ?? null,
    alerts,
    initials: getInitials(name),
    hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
  };
}

function BrandLandingContent() {
  const router = useRouter();
  const { data, isLoading, isError } = useTenantBrands();
  const [search, setSearch] = useState('');
  const dynamicChips = useMemo(() => ['All categories', ...(data?.categories ?? []), 'At risk'], [data?.categories]);
  const [activeChip, setActiveChip] = useState<string>('All categories');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const brands = useMemo(() => (data?.brands ?? []).map(toBrandVm), [data?.brands]);
  const portfolioGmv = useMemo(
    () => data?.kpis?.portfolio_gmv_mtd ?? brands.reduce((sum, brand) => sum + brand.gmv, 0),
    [brands, data?.kpis?.portfolio_gmv_mtd]
  );
  const updatedBrands = useMemo(
    () => brands.map((brand) => ({ ...brand, share: portfolioGmv > 0 ? Math.round((brand.gmv / portfolioGmv) * 100) : 0 })),
    [brands, portfolioGmv]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byChip = updatedBrands.filter((brand) => {
      if (activeChip === 'All categories') return true;
      if (activeChip === 'At risk') return brand.alerts.length > 0;
      return brand.category === activeChip;
    });
    const bySearch = byChip.filter((brand) => {
      if (!query) return true;
      return brand.name.toLowerCase().includes(query) || brand.category.toLowerCase().includes(query);
    });
    return bySearch.sort((a, b) => {
      if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
      if (sortBy === 'GMV (low → high)') return a.gmv - b.gmv;
      if (sortBy === 'Growth (high → low)') return b.growth - a.growth;
      return a.daysSinceCatalog - b.daysSinceCatalog;
    });
  }, [activeChip, search, sortBy, updatedBrands]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeChip, search, sortBy]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    onLoadMore: () => setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length)),
  });

  const attention = useMemo(() => updatedBrands.filter((brand) => brand.alerts.length > 0), [updatedBrands]);
  const topPerformers = useMemo(() => [...updatedBrands].sort((a, b) => b.gmv - a.gmv).slice(0, 2), [updatedBrands]);
  const topRisers = useMemo(() => [...updatedBrands].sort((a, b) => b.growth - a.growth).slice(0, 2), [updatedBrands]);
  const catalogFresh = data?.kpis?.catalog_freshness_count ?? updatedBrands.filter((brand) => brand.daysSinceCatalog <= 14).length;
  const growthVsPrior = useMemo(() => {
    const prior = data?.kpis?.portfolio_gmv_prev_mtd ?? updatedBrands.reduce((sum, brand) => sum + brand.gmvPrior, 0);
    if (prior <= 0) return 0;
    return Math.round(((portfolioGmv - prior) / prior) * 100);
  }, [data?.kpis?.portfolio_gmv_prev_mtd, updatedBrands, portfolioGmv]);
  const activeBuyers = useMemo(
    () => updatedBrands.reduce((max, brand) => Math.max(max, brand.activeBuyers), 0),
    [updatedBrands]
  );
  const totalBuyers = useMemo(
    () => updatedBrands.reduce((max, brand) => Math.max(max, brand.totalBuyers), 0),
    [updatedBrands]
  );

  const attentionReason = (alerts: string[]) => {
    const reasons: string[] = [];
    if (alerts.includes('low_stock')) reasons.push('Low stock SKUs (qty <= reorder point)');
    if (alerts.includes('gmv_decline')) reasons.push('GMV is below previous month-to-date');
    if (alerts.includes('not_in_catalog_mtd')) reasons.push('Not published in any catalog this month');
    return reasons.join(' · ');
  };
  const freshnessHelp = () => {
    const days = data?.kpis?.catalog_freshness_earliest_days;
    const fresh = data?.kpis?.catalog_freshness_count ?? 0;
    const total = data?.kpis?.total_published_catalogs ?? 0;
    const denom = `${fresh}/${total} catalogs`;
    if (days == null) return `${denom} published this month`;
    if (days === 0) return `${denom} published today`;
    if (days === 1) return `${denom} published yesterday`;
    return `${denom} published in the last ${days} days`;
  };

  if (isLoading) return <LoadingState label="Loading brands..." />;
  if (isError) {
    return (
      <ErrorState heading="Couldn't load brands" description="There was a problem fetching your brands. Please try again." />
    );
  }

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Portfolio"
        title="Brands"
        subtitle={`${updatedBrands.length} brand principals. Phani Distribution carries them across ${totalBuyers} buyers in this month. This is your portfolio at a glance.`}
        horizon="This month"
        secondary={{ label: 'Invite a principal', icon: <UserPlus size={13} />, onClick: () => setInviteOpen(true) }}
        primary="Add a brand"
        onPrimaryClick={() => setAddBrandOpen(true)}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Portfolio GMV',
            value: formatCompactInr(portfolioGmv),
            sub: `${growthVsPrior >= 0 ? '↑ +' : '↓ '}${Math.abs(growthVsPrior)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Brands carried',
            value: `${data?.kpis?.brands_carried ?? updatedBrands.length}`,
            sub: `${data?.kpis?.buyers_with_orders_mtd ?? activeBuyers} of ${data?.kpis?.total_buyers ?? totalBuyers} buyers active`,
          },
          {
            label: 'Need attention',
            value: `${data?.kpis?.need_attention_count ?? attention.length}`,
            sub: `${attention.reduce((sum, brand) => sum + brand.alerts.length, 0)} alerts open`,
            tone: 'warn',
          },
          {
            label: 'Catalog freshness',
            value: `${catalogFresh}`,
            sub: freshnessHelp(),
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs attention',
            hint: `${attention.length} brands`,
            rows: attention.slice(0, 2).map((brand) => ({
              initials: brand.initials,
              hue: brand.hue,
              name: brand.name,
              reason: attentionReason(brand.alerts),
              trailing: brand.growth > 0 ? `↑ +${brand.growth}%` : brand.growth < 0 ? `↓ ${Math.abs(brand.growth)}%` : '· flat',
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top performers',
            hint: 'by GMV',
            rows: topPerformers.map((brand) => ({
              initials: brand.initials,
              hue: brand.hue,
              name: brand.name,
              reason: `${brand.share}% of portfolio · ${brand.activeBuyers} buyers`,
              trailing: formatCompactInr(brand.gmv),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: topRisers.map((brand) => ({
              initials: brand.initials,
              hue: brand.hue,
              name: brand.name,
              reason: `from ${formatCompactInr(brand.gmvPrior)} → ${formatCompactInr(brand.gmv)} this month`,
              trailing: brand.growth > 0 ? `↑ +${brand.growth}%` : brand.growth < 0 ? `↓ ${Math.abs(brand.growth)}%` : '· flat',
            })),
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} brands`}
        searchPlaceholder="Search brand or category…"
        chips={dynamicChips}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={(chip) => setActiveChip(chip)}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />

      <LandingTable
        columns={[
          { label: 'Brand', width: 320, className: 'px-5' },
          { label: 'GMV · MTD', className: 'px-5' },
          { label: 'Growth', className: 'px-5' },
          { label: 'Share of portfolio', className: 'px-5' },
          { label: 'Active buyers', align: 'right', className: 'px-5' },
          { label: 'Catalog', className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
      >
        {visibleRows.map((brand) => (
          <tr
            key={brand.id}
            className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
            onClick={() => router.push(`/brands/${brand.id}`)}
          >
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <div className="ent flex items-center gap-3">
                <EntityAvatar initials={brand.initials} hue={brand.hue} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-cream-900">{brand.name}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-cream-700">
                    {brand.category.toUpperCase()} · {brand.region.toUpperCase()} · {brand.skus} SKUs
                  </p>
                </div>
              </div>
            </td>
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <span className="font-display text-[15px] font-medium text-cream-900 tabular-nums">{formatCompactInr(brand.gmv)}</span>
            </td>
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <GrowthPill value={brand.growth} />
            </td>
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <div className="mb-1 h-[5px] w-[184px] overflow-hidden rounded-full bg-cream-200">
                <div
                  className={`h-[5px] rounded-full ${brand.hue === 'ember' ? 'bg-ember-400' : brand.hue === 'cream' ? 'bg-cream-600' : 'bg-teal-500'}`}
                  style={{ width: `${Math.max(0, Math.min(100, brand.share))}%` }}
                />
              </div>
              <p className="font-mono text-[11px] text-cream-700">{brand.share}% of {formatCompactInr(portfolioGmv)}</p>
            </td>
            <td className="px-5 py-3.5 text-right font-mono text-[13px] text-cream-900 tabular-nums">
              {brand.activeBuyers}<span className="text-cream-600"> / {brand.totalBuyers}</span>
            </td>
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <div className="space-y-1">
                <p className="truncate text-[12px] text-cream-900">{brand.catalogName ?? 'No published catalog'}</p>
                <StatusTag
                  tone={brand.daysSinceCatalog <= 14 ? 'success' : 'warning'}
                  label={brand.daysSinceCatalog < 999 ? `${brand.daysSinceCatalog}d ago` : 'n/a'}
                />
              </div>
            </td>
            <td className="chev px-4 py-3.5 pr-4 text-right text-[16px] text-cream-500">›</td>
          </tr>
        ))}
      </LandingTable>

      {hasMore ? (
        <div ref={sentinelRef} className="h-10 w-full" aria-hidden="true" />
      ) : null}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AddBrandCommand open={addBrandOpen} onOpenChange={setAddBrandOpen} hideTrigger />
    </PageWrap>
  );
}

export default function BrandsPage() {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <BrandLandingContent />
    </FeatureGate>
  );
}
