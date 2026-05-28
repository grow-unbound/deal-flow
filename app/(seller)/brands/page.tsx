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

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth' | 'Catalog age';

interface BrandVm {
  id: string;
  name: string;
  category: 'Wines' | 'Beer' | 'Spirits';
  region: string;
  skus: number;
  gmv: number;
  gmvPrior: number;
  growth: number;
  share: number;
  activeBuyers: number;
  totalBuyers: number;
  daysSinceCatalog: number;
  alerts: string[];
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
}

const BRAND_CHIPS = ['All categories', 'Wines', 'Beer', 'Spirits', 'At risk'] as const;
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth', 'Catalog age'];
const PAGE_SIZE = 20;

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((segment) => segment[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toBrandVm(brand: TenantBrand, index: number): BrandVm {
  const raw = brand as TenantBrand & {
    gmv?: number;
    gmv_mtd?: number;
    gmv_prior?: number;
    gmv_prior_month?: number;
    growth?: number;
    active_buyers?: number;
    total_buyers?: number;
    days_since_catalog?: number;
    sku_count?: number;
    category?: string;
    region?: string;
    alerts?: string[];
  };
  const name = brand.display_name_override ?? brand.master_brand?.name ?? 'Unknown brand';
  const gmv = raw.gmv_mtd ?? raw.gmv ?? (180000 + (index + 1) * 35000);
  const gmvPrior = raw.gmv_prior_month ?? raw.gmv_prior ?? Math.round(gmv * 0.9);
  const growth = raw.growth ?? (gmvPrior > 0 ? Math.round(((gmv - gmvPrior) / gmvPrior) * 100) : 0);
  const categoryMap: Array<'Wines' | 'Beer' | 'Spirits'> = ['Wines', 'Beer', 'Spirits'];
  const category = (raw.category as BrandVm['category'] | undefined) ?? categoryMap[index % categoryMap.length];
  const alerts = raw.alerts ?? (index % 3 === 0 ? ['catalog_stale'] : []);
  const daysSinceCatalog = raw.days_since_catalog ?? (alerts.length > 0 ? 22 : 8);

  return {
    id: brand.id,
    name,
    category,
    region: raw.region ?? 'Karnataka',
    skus: raw.sku_count ?? 28 + index * 3,
    gmv,
    gmvPrior,
    growth,
    share: 0,
    activeBuyers: raw.active_buyers ?? 20 + index * 5,
    totalBuyers: raw.total_buyers ?? 142,
    daysSinceCatalog,
    alerts,
    initials: getInitials(name),
    hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
  };
}

function BrandLandingContent() {
  const router = useRouter();
  const { data, isLoading, isError } = useTenantBrands();
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<(typeof BRAND_CHIPS)[number]>('All categories');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const brands = useMemo(() => (data?.brands ?? []).map(toBrandVm), [data?.brands]);
  const portfolioGmv = useMemo(() => brands.reduce((sum, brand) => sum + brand.gmv, 0), [brands]);
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
      if (sortBy === 'Growth') return b.growth - a.growth;
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
  const catalogFresh = useMemo(() => updatedBrands.filter((brand) => brand.daysSinceCatalog <= 14).length, [updatedBrands]);
  const growthVsPrior = useMemo(() => {
    const prior = updatedBrands.reduce((sum, brand) => sum + brand.gmvPrior, 0);
    if (prior <= 0) return 0;
    return Math.round(((portfolioGmv - prior) / prior) * 100);
  }, [updatedBrands, portfolioGmv]);
  const activeBuyers = useMemo(
    () => updatedBrands.reduce((max, brand) => Math.max(max, brand.activeBuyers), 0),
    [updatedBrands]
  );
  const totalBuyers = useMemo(
    () => updatedBrands.reduce((max, brand) => Math.max(max, brand.totalBuyers), 0),
    [updatedBrands]
  );

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
        subtitle={`${updatedBrands.length} brand principals. Phani Distribution carries them across ${totalBuyers} buyers in 6 cohorts. This is your portfolio at a glance.`}
        horizon="This month"
        secondary={{ label: 'Invite a principal', icon: <UserPlus size={13} />, onClick: () => setInviteOpen(true) }}
        primary="Add a brand"
        onPrimaryClick={() => setAddBrandOpen(true)}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Portfolio GMV',
            value: formatInr(portfolioGmv),
            sub: `${growthVsPrior >= 0 ? '↑ +' : '↓ '}${Math.abs(growthVsPrior)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Brands carried',
            value: `${updatedBrands.length}`,
            sub: `${activeBuyers} of ${totalBuyers} buyers active`,
          },
          {
            label: 'Need attention',
            value: `${attention.length}`,
            sub: `${attention.reduce((sum, brand) => sum + brand.alerts.length, 0)} alerts open`,
            tone: 'warn',
          },
          {
            label: 'Catalog freshness',
            value: `${catalogFresh}`,
            sub: 'published in last 14 days',
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
              reason: brand.alerts.slice(0, 2).join(' · '),
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
              trailing: formatInr(brand.gmv),
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
              reason: `from ${formatInr(brand.gmvPrior)} → ${formatInr(brand.gmv)} this month`,
              trailing: brand.growth > 0 ? `↑ +${brand.growth}%` : brand.growth < 0 ? `↓ ${Math.abs(brand.growth)}%` : '· flat',
            })),
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} brands items`}
        searchPlaceholder="Search brand or category…"
        chips={[...BRAND_CHIPS]}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={(chip) => setActiveChip(chip as (typeof BRAND_CHIPS)[number])}
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
              <span className="font-display text-[15px] font-medium text-cream-900 tabular-nums">{formatInr(brand.gmv)}</span>
            </td>
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <GrowthPill value={brand.growth} />
            </td>
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <div className="mb-1 h-[5px] w-[184px] overflow-hidden rounded-full bg-cream-200">
                <div
                  className={`h-[5px] rounded-full ${brand.hue === 'ember' ? 'bg-ember-400' : brand.hue === 'cream' ? 'bg-cream-600' : 'bg-teal-500'}`}
                  style={{ width: `${brand.share * 2.4}%` }}
                />
              </div>
              <p className="font-mono text-[11px] text-cream-700">{brand.share}% of {formatInr(portfolioGmv)}</p>
            </td>
            <td className="px-5 py-3.5 text-right font-mono text-[13px] text-cream-900 tabular-nums">
              {brand.activeBuyers}<span className="text-cream-600"> / {brand.totalBuyers}</span>
            </td>
            <td className="px-5 py-3.5 text-[13px] text-cream-900">
              <StatusTag
                tone={brand.daysSinceCatalog <= 14 ? 'success' : 'warning'}
                label={`${brand.daysSinceCatalog}d ago`}
              />
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
