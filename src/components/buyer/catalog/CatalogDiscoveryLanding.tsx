'use client';

import * as React from 'react';
import { SearchX } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { BuyerCatalogDesktopLayout } from '@/components/buyer/catalog/BuyerCatalogDesktopLayout';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { DiscoveryThumbTile } from '@/components/buyer/catalog/DiscoveryThumbTile';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';
import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { BUYER_LOOKBOOK_ASPECT_CLASS, BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX } from '@/lib/buyer-lookbook';
import {
  BUYER_CARD_RADIUS_CLASS,
  BUYER_DISCOVERY_GRID_CLASS,
  BUYER_INFINITE_SCROLL_RATIO,
  BUYER_TWO_LINE_TITLE_CLASS,
} from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  useBuyerBrands,
  useBuyerCatalogs,
  useBuyerCatalogSearchInfinite,
  useBuyerCategories,
} from '@/hooks/useBuyerProducts';
import type { BuyerCatalogItem } from '@/types/buyer';

function formatProductCount(count: number): string {
  return `${count} product${count === 1 ? '' : 's'}`;
}

export function CatalogDiscoveryLanding(): React.ReactNode {
  const posthog = usePostHog();
  const { setRefreshFn } = useBuyerRealtimeContext();

  const {
    data: catalogsData,
    isLoading: catalogsLoading,
    isError: catalogsError,
    refetch: refetchCatalogs,
  } = useBuyerCatalogs();
  const {
    data: brandsData,
    isLoading: brandsLoading,
    isError: brandsError,
    refetch: refetchBrands,
  } = useBuyerBrands();
  const {
    data: categoriesData,
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useBuyerCategories();

  const catalogs = catalogsData ?? [];
  const brands = brandsData ?? [];
  const categories = categoriesData ?? [];

  // Skeletons only on cold cache — never replace already-rendered sections during refetch.
  const showCampaignsSkeleton = catalogsLoading && catalogsData === undefined;
  const showBrandsSkeleton = brandsLoading && brandsData === undefined;
  const showCategoriesSkeleton = categoriesLoading && categoriesData === undefined;

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
  const searchEventKeyRef = React.useRef<string | null>(null);

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

  React.useEffect(() => {
    setRefreshFn(async () => {
      await Promise.all([
        refetchCatalogs(),
        refetchBrands(),
        refetchCategories(),
      ]);
    });
    return () => setRefreshFn(null);
  }, [refetchBrands, refetchCatalogs, refetchCategories, setRefreshFn]);

  React.useEffect(() => {
    if (!posthog || debouncedSearch.length === 0 || searchQueryResult.isFetching) return;
    const key = `${debouncedSearch}:${searchItems.length}:${searchError ? 'error' : 'ok'}`;
    if (searchEventKeyRef.current === key) return;
    searchEventKeyRef.current = key;
    posthog.capture('buyer_catalog_search_results_viewed', {
      source_surface: 'catalog_landing',
      query_length: debouncedSearch.length,
      result_count: searchItems.length,
      has_more: searchHasMore,
      status: searchError ? 'error' : 'success',
    });
  }, [debouncedSearch, posthog, searchError, searchHasMore, searchItems.length, searchQueryResult.isFetching]);

  const isSearching = debouncedSearch.length > 0;

  const allSectionsFailed =
    catalogsError && brandsError && categoriesError
    && !showCampaignsSkeleton && !showBrandsSkeleton && !showCategoriesSkeleton;

  return (
    <div className="flex flex-col pb-8">
      <BuyerCatalogLandingHeader
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <BuyerCatalogDesktopLayout contentClassName="space-y-0 px-3">
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
        ) : allSectionsFailed ? (
          <p className="px-1 pt-4 text-center text-sm" style={{ color: 'var(--danger-500, #dc2626)' }}>
            Could not load catalog. Pull to retry or search above.
          </p>
        ) : (
          <>
            {showCampaignsSkeleton || catalogs.length > 0 ? (
              <section className="pt-10 lg:pt-6">
                <BuyerSectionRow title="Campaigns" href="/buy/promotions" linkLabel="See all" className="px-1 pb-3" />
                {showCampaignsSkeleton ? (
                  <CampaignCarouselSkeleton />
                ) : (
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
                        priority={idx === 0}
                      />
                    ))}
                  </BuyerHorizontalScroll>
                )}
              </section>
            ) : null}

            {showBrandsSkeleton || brands.length > 0 ? (
              <section className="pt-10">
                <BuyerSectionRow title="Brands" className="px-1 pb-3" />
                {showBrandsSkeleton ? (
                  <BrandScrollSkeleton />
                ) : (
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
                )}
              </section>
            ) : null}

            {showCategoriesSkeleton || categories.length > 0 ? (
              <section className="pt-10 pb-4">
                <BuyerSectionRow title="Categories" className="px-1 pb-3" />
                {showCategoriesSkeleton ? (
                  <CategoryGridSkeleton />
                ) : (
                  <div className={BUYER_DISCOVERY_GRID_CLASS}>
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
                )}
              </section>
            ) : null}
          </>
        )}
      </BuyerCatalogDesktopLayout>
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
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
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

/** Matches CatalogLookbookCard carousel cards. */
function CampaignCarouselSkeleton(): React.ReactNode {
  return (
    <div className="flex gap-3 overflow-hidden px-1" role="status" aria-label="Loading campaigns">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className={cn('shrink-0 overflow-hidden border border-cream-200', BUYER_CARD_RADIUS_CLASS)}
          style={{ width: BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX }}
        >
          <div className={cn('buyer-lookbook-preview w-full animate-pulse bg-cream-100', BUYER_LOOKBOOK_ASPECT_CLASS)} />
          <div className="space-y-2 bg-white px-5 py-4">
            <div className={cn('animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)} />
            <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches DiscoveryThumbTile brand scroll variant (aspect-square + min-h-[5.25rem] footer). */
function BrandScrollSkeleton(): React.ReactNode {
  return (
    <div className="flex gap-2 overflow-hidden px-1" role="status" aria-label="Loading brands">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-[calc((100vw-2.5rem)/3)] max-w-[124px] shrink-0 overflow-hidden border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]',
            BUYER_CARD_RADIUS_CLASS,
          )}
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="flex min-h-[5.25rem] flex-col bg-cream-50 px-3 pb-3 pt-2.5">
            <div className={cn('animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)} />
            <div className="mt-0.5 h-3 w-14 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches DiscoveryThumbTile category grid variant. */
function CategoryGridSkeleton(): React.ReactNode {
  return (
    <div className={cn(BUYER_DISCOVERY_GRID_CLASS, 'lg:hidden')} role="status" aria-label="Loading categories">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'overflow-hidden border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]',
            BUYER_CARD_RADIUS_CLASS,
          )}
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="flex min-h-[5.25rem] flex-col bg-cream-50 px-3 pb-3 pt-2.5">
            <div className={cn('animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)} />
            <div className="mt-0.5 h-3 w-14 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
