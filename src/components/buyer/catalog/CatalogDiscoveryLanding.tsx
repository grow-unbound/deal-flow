'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BuyerEntityChipNav } from '@/components/buyer/catalog/BuyerEntityChipNav';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { DiscoveryThumbTile } from '@/components/buyer/catalog/DiscoveryThumbTile';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';
import { apiFetch } from '@/lib/api-fetch';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerCatalogLandingData } from '@/hooks/useBuyerProducts';
import type { BuyerCatalogItem } from '@/types/buyer';

function formatProductCount(count: number): string {
  return `${count} product${count === 1 ? '' : 's'}`;
}

export function CatalogDiscoveryLanding(): React.ReactNode {
  const landingQuery = useBuyerCatalogLandingData();
  const categories = landingQuery.data?.categories ?? [];
  const brands = landingQuery.data?.brands ?? [];
  const catalogs = landingQuery.data?.catalogs ?? [];
  const loading = landingQuery.isLoading;
  const error = landingQuery.isError;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [searchItems, setSearchItems] = React.useState<BuyerCatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    if (!debouncedSearch) {
      setSearchItems([]);
      setSearchLoading(false);
      setSearchError(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError(false);

    const params = new URLSearchParams({ limit: '60', offset: '0', search: debouncedSearch });
    apiFetch(`/api/buyer/catalog?${params.toString()}`)
      .then((response) => response.json() as Promise<{ items?: BuyerCatalogItem[] }>)
      .then((data) => {
        if (!cancelled) setSearchItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setSearchError(true);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const isSearching = debouncedSearch.length > 0;

  const categoryChips = (
    <BuyerEntityChipNav
      kind="category"
      categories={categories}
      selectedId={null}
      mode="landing"
    />
  );

  return (
    <div className="flex flex-col pb-8">
      <BuyerCatalogLandingHeader
        categoryChips={loading ? null : categoryChips}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="space-y-0 px-3">
        {isSearching ? (
          <CatalogSearchResults
            loading={searchLoading}
            error={searchError}
            items={searchItems}
            query={debouncedSearch}
          />
        ) : loading ? (
          <LandingBodySkeleton />
        ) : error ? (
          <p className="px-1 pt-4 text-center text-sm" style={{ color: 'var(--danger-500, #dc2626)' }}>
            Could not load catalog. Pull to retry or search above.
          </p>
        ) : (
          <>
            {catalogs.length > 0 ? (
              <section className="pt-10">
                <SectionRow title="Campaigns" href="/buy/promotions" linkLabel="See all" />
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
                  {catalogs.map((c, idx) => (
                    <CatalogLookbookCard
                      key={c.id}
                      id={c.id}
                      name={c.name}
                      productCount={c.product_count}
                      href={`/buy/catalog/list/${c.id}`}
                      validUntil={c.valid_until}
                      heroImageUrl={c.hero_image_url}
                      hueIndex={idx}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {brands.length > 0 ? (
              <section className="pt-10">
                <SectionRow title="Brands" />
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-none">
                  {brands.slice(0, 24).map((b) => (
                    <DiscoveryThumbTile
                      key={b.id}
                      href={`/buy/catalog/brand/${b.id}`}
                      label={b.name}
                      imageUrl={b.logo_url}
                      entityKind="brand"
                      variant="scroll"
                      onNavigate={() => markBuyerNavigationForward()}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {categories.length > 0 ? (
              <section className="pt-10 pb-4">
                <SectionRow title="Categories" />
                <div className="grid grid-cols-3 gap-2">
                  {categories.map((cat) => (
                    <DiscoveryThumbTile
                      key={cat.id}
                      href={`/buy/catalog/category/${cat.id}`}
                      label={cat.name}
                      imageUrl={cat.image_url}
                      subtitle={formatProductCount(cat.product_count)}
                      entityKind="category"
                      onNavigate={() => markBuyerNavigationForward()}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function CatalogSearchResults({
  loading,
  error,
  items,
  query,
}: {
  loading: boolean;
  error: boolean;
  items: BuyerCatalogItem[];
  query: string;
}): React.ReactNode {
  if (loading) {
    return (
      <section className="pt-3 pb-4">
        <ProductGrid items={[]} loading />
      </section>
    );
  }
  if (error) {
    return (
      <p className="px-1 pt-4 text-center text-sm" style={{ color: 'var(--danger-500, #dc2626)' }}>
        Could not load search results.
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-1 pt-4 text-center text-sm text-[var(--fg-3)]">
        No matches for &ldquo;{query}&rdquo;. Try another term.
      </p>
    );
  }
  return (
    <section className="pt-3 pb-4">
      <ProductGrid items={items} />
    </section>
  );
}

function SectionRow({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <h2
        className="leading-none text-[var(--cream-900)]"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--b-text-section)',
          fontWeight: 500,
          letterSpacing: '-0.005em',
        }}
      >
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          onClick={() => markBuyerNavigationForward()}
          className="inline-flex items-center gap-1.5 font-medium tracking-[-0.01em] text-[var(--teal-500)] no-underline"
          style={{ fontSize: 'var(--b-text-label)' }}
        >
          {linkLabel ?? 'See all'}
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function LandingBodySkeleton(): React.ReactNode {
  return (
    <div className="space-y-10 pt-10" role="status" aria-label="Loading catalog">
      <section>
        <div className="mb-3 h-5 w-28 animate-pulse rounded bg-cream-200" />
        <div className="-mx-1 flex gap-2 overflow-hidden px-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="w-[200px] shrink-0 overflow-hidden rounded-xl border border-cream-200">
              <div className="h-[220px] animate-pulse bg-cream-100" />
              <div className="h-10 animate-pulse bg-cream-50" />
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 h-5 w-20 animate-pulse rounded bg-cream-200" />
        <div className="-mx-1 flex gap-3 overflow-hidden px-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[88px] shrink-0">
              <div className="mx-auto h-[72px] w-[72px] animate-pulse rounded-xl bg-cream-100" />
              <div className="mx-auto mt-2 h-3 w-14 animate-pulse rounded bg-cream-200" />
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 h-5 w-24 animate-pulse rounded bg-cream-200" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]"
            >
              <div className="aspect-square animate-pulse bg-cream-100" />
              <div className="bg-cream-50 px-3 pb-3 pt-2.5">
                <div className="h-3.5 w-20 animate-pulse rounded bg-cream-200" />
                <div className="mt-1.5 h-3 w-14 animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
