'use client';

import * as React from 'react';
import { SearchX } from 'lucide-react';
import { BuyerEntityChipNav } from '@/components/buyer/catalog/BuyerEntityChipNav';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { DiscoveryThumbTile } from '@/components/buyer/catalog/DiscoveryThumbTile';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';
import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { BUYER_CARD_RADIUS_CLASS, BUYER_INFINITE_SCROLL_RATIO, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useBuyerCatalogLandingData, useBuyerCatalogSearchInfinite } from '@/hooks/useBuyerProducts';
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

  const searchQueryResult = useBuyerCatalogSearchInfinite(debouncedSearch, {}, debouncedSearch.length > 0);
  const searchPages = searchQueryResult.data?.pages ?? [];
  const searchItems = React.useMemo(
    () => searchPages.flatMap((page) => page.items ?? []),
    [searchPages],
  );
  const searchHasMore = searchPages.at(-1)?.has_more ?? false;
  const searchLoading = searchQueryResult.isLoading && searchItems.length === 0;
  const searchError = searchQueryResult.isError;
  const searchLoadingMore = searchQueryResult.isFetchingNextPage;

  const searchSentinelIndex = getSentinelInsertIndex(searchItems.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef: searchSentinelRef } = useInfiniteScroll({
    hasMore: searchHasMore,
    isLoading: searchLoadingMore,
    onLoadMore: () => { void searchQueryResult.fetchNextPage(); },
  });

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
            loadingMore={searchLoadingMore}
            sentinelIndex={searchSentinelIndex}
            sentinelRef={searchSentinelRef}
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
                <BuyerSectionRow title="Campaigns" href="/buy/promotions" linkLabel="See all" className="px-1 pb-3" />
                <BuyerHorizontalScroll className="gap-3 px-1">
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
                </BuyerHorizontalScroll>
              </section>
            ) : null}

            {brands.length > 0 ? (
              <section className="pt-10">
                <BuyerSectionRow title="Brands" className="px-1 pb-3" />
                <BuyerHorizontalScroll className="items-stretch gap-2 px-1">
                  {brands.slice(0, 24).map((b) => (
                    <DiscoveryThumbTile
                      key={b.id}
                      href={`/buy/catalog/brand/${b.id}`}
                      label={b.name}
                      imageUrl={b.logo_url}
                      subtitle={b.product_count != null ? formatProductCount(b.product_count) : undefined}
                      entityKind="brand"
                      variant="scroll"
                      onNavigate={() => markBuyerNavigationForward()}
                    />
                  ))}
                </BuyerHorizontalScroll>
              </section>
            ) : null}

            {categories.length > 0 ? (
              <section className="pt-10 pb-4">
                <BuyerSectionRow title="Categories" className="px-1 pb-3" />
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
  loadingMore = false,
  sentinelIndex = -1,
  sentinelRef,
}: {
  loading: boolean;
  error: boolean;
  items: BuyerCatalogItem[];
  query: string;
  loadingMore?: boolean;
  sentinelIndex?: number;
  sentinelRef?: React.RefObject<HTMLDivElement>;
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
      <div className="px-1 pt-4">
        <div className="rounded-[20px] border border-[var(--border-1)] bg-[var(--bg-surface)] px-6 py-8 text-center shadow-[0_1px_3px_rgba(34,30,26,0.04)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cream-100)] text-[var(--cream-700)]">
            <SearchX className="h-5 w-5" />
          </div>
          <h2
            className="mt-4 text-lg font-semibold text-[var(--fg-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            No products found
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--fg-3)]">
            No matches for &ldquo;{query}&rdquo;. Try another term.
          </p>
        </div>
      </div>
    );
  }
  return (
    <section className="pt-3 pb-4">
      <ProductGrid
        items={items}
        loadingMore={loadingMore}
        sentinelIndex={sentinelIndex}
        sentinelRef={sentinelRef}
      />
    </section>
  );
}

function LandingBodySkeleton(): React.ReactNode {
  return (
    <div className="space-y-10 pt-10" role="status" aria-label="Loading catalog">
      <section>
        <div className="mb-3 h-5 w-28 animate-pulse rounded bg-cream-200" />
        <div className="flex gap-3 overflow-hidden px-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={cn('w-[280px] shrink-0 overflow-hidden border border-cream-200', BUYER_CARD_RADIUS_CLASS)}>
              <div className="buyer-lookbook-preview w-full animate-pulse bg-cream-100" />
              {/* min-h-[2.4em] matches CatalogLookbookCard's reserved 2-line title height */}
              <div className="space-y-2 bg-white px-5 py-4">
                <div className="flex min-h-[2.4em] flex-col justify-center gap-1">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-cream-200" />
                  <div className="h-3.5 w-1/2 animate-pulse rounded bg-cream-200" />
                </div>
                <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 h-5 w-20 animate-pulse rounded bg-cream-200" />
        <div className="-mx-1 flex gap-2 overflow-hidden px-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={cn('w-[calc((100vw-2.5rem)/3)] max-w-[124px] shrink-0 overflow-hidden border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]', BUYER_CARD_RADIUS_CLASS)}
            >
              <div className="aspect-square animate-pulse bg-cream-100" />
              {/* min-h matches DiscoveryThumbTile's BUYER_TWO_LINE_TITLE_CLASS reserved title height */}
              <div className="bg-cream-50 px-3 pb-3 pt-2.5">
                <div className={cn('flex flex-col justify-center gap-1', BUYER_TWO_LINE_TITLE_CLASS)}>
                  <div className="h-3.5 w-16 animate-pulse rounded bg-cream-200" />
                  <div className="h-3.5 w-10 animate-pulse rounded bg-cream-200" />
                </div>
                <div className="mt-1.5 h-3 w-12 animate-pulse rounded bg-cream-200" />
              </div>
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
              className={cn('overflow-hidden border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]', BUYER_CARD_RADIUS_CLASS)}
            >
              <div className="aspect-square animate-pulse bg-cream-100" />
              {/* min-h matches DiscoveryThumbTile's BUYER_TWO_LINE_TITLE_CLASS reserved title height */}
              <div className="bg-cream-50 px-3 pb-3 pt-2.5">
                <div className={cn('flex flex-col justify-center gap-1', BUYER_TWO_LINE_TITLE_CLASS)}>
                  <div className="h-3.5 w-20 animate-pulse rounded bg-cream-200" />
                  <div className="h-3.5 w-12 animate-pulse rounded bg-cream-200" />
                </div>
                <div className="mt-1.5 h-3 w-14 animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
