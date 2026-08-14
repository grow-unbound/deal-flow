'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePostHog } from 'posthog-js/react';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { BuyerCatalogDesktopLayout } from '@/components/buyer/catalog/BuyerCatalogDesktopLayout';
import { CatalogSearchEmptyState, CatalogSearchErrorState } from '@/components/buyer/catalog/CatalogSearchState';
import { DiscoveryThumbTile } from '@/components/buyer/catalog/DiscoveryThumbTile';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { ProductCard } from '@/components/buyer/catalog/ProductCard';
import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';
import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import {
  useBuyerBrands,
  useBuyerCatalogs,
  useBuyerCatalogSearchInfinite,
  useBuyerCategories,
} from '@/hooks/useBuyerProducts';
import { apiFetch } from '@/lib/api-fetch';
import {
  BUYER_LOOKBOOK_ASPECT_CLASS,
  BUYER_LOOKBOOK_COMPACT_CAROUSEL_WIDTH_CLASS,
  BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS,
} from '@/lib/buyer-lookbook';
import type { BuyerHomePromotionsResponse, BuyerHomeRecoResponse } from '@/lib/buyer-home-types';
import { BUYER_CARD_RADIUS_CLASS, BUYER_INFINITE_SCROLL_RATIO, BUYER_PRODUCT_GRID_CLASS, BUYER_TILE_FRAME_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { BUYER_REFERENCE_QUERY_GC_TIME, BUYER_REFERENCE_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { BuyerCatalogItem } from '@/types/buyer';
import { cn } from '@/lib/utils';

function formatProductCount(count: number): string {
  return `${count} product${count === 1 ? '' : 's'}`;
}

async function fetchBuyerHomePromotions(): Promise<BuyerHomePromotionsResponse> {
  const response = await apiFetch('/api/buyer/home/promotions');
  if (!response.ok) throw new Error('Failed to fetch promotions');
  return response.json() as Promise<BuyerHomePromotionsResponse>;
}

async function fetchBuyerHomeReco(): Promise<BuyerHomeRecoResponse> {
  const response = await apiFetch('/api/buyer/home/reco');
  if (!response.ok) throw new Error('Failed to fetch recommendations');
  return response.json() as Promise<BuyerHomeRecoResponse>;
}

export function CatalogDiscoveryLanding(): React.ReactNode {
  const posthog = usePostHog();
  const { setRefreshFn } = useBuyerRealtimeContext();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const searchEventKeyRef = React.useRef<string | null>(null);

  const {
    data: promotionsData,
    isLoading: promotionsLoading,
    isError: promotionsError,
    refetch: refetchPromotions,
  } = useQuery({
    queryKey: ['buyer-home-promotions'],
    queryFn: fetchBuyerHomePromotions,
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });
  const {
    data: recoData,
    isLoading: recoLoading,
    isError: recoError,
    refetch: refetchReco,
  } = useQuery({
    queryKey: ['buyer-home-reco'],
    queryFn: fetchBuyerHomeReco,
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });
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

  const searchQueryResult = useBuyerCatalogSearchInfinite(debouncedSearch, {}, debouncedSearch.length > 0);
  const searchPages = searchQueryResult.data?.pages ?? [];
  const searchItems = React.useMemo(() => searchPages.flatMap((page) => page.items ?? []), [searchPages]);
  const searchHasMore = searchPages.at(-1)?.has_more ?? false;
  const searchLoading = searchQueryResult.isLoading && searchItems.length === 0;
  const searchError = searchQueryResult.isError;
  const searchLoadingMore = searchQueryResult.isFetchingNextPage;

  const promotions = promotionsData?.latest_promotions_preview ?? [];
  const orderAgainItems = recoData?.order_again_preview ?? [];
  const bestsellers = recoData?.bestsellers ?? [];
  const catalogs = catalogsData ?? [];
  const brands = brandsData ?? [];
  const categories = categoriesData ?? [];

  const showPromotionsSkeleton = promotionsLoading && promotionsData === undefined;
  const showRecoSkeleton = recoLoading && recoData === undefined;
  const showCatalogsSkeleton = catalogsLoading && catalogsData === undefined;
  const showBrandsSkeleton = brandsLoading && brandsData === undefined;
  const showCategoriesSkeleton = categoriesLoading && categoriesData === undefined;
  const isSearching = debouncedSearch.length > 0;
  const allSectionsFailed =
    promotionsError && recoError && catalogsError && brandsError && categoriesError
    && !showPromotionsSkeleton && !showRecoSkeleton && !showCatalogsSkeleton && !showBrandsSkeleton && !showCategoriesSkeleton;

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
        refetchPromotions(),
        refetchReco(),
        refetchCatalogs(),
        refetchBrands(),
        refetchCategories(),
      ]);
    });
    return () => setRefreshFn(null);
  }, [refetchBrands, refetchCatalogs, refetchCategories, refetchPromotions, refetchReco, setRefreshFn]);

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

  return (
    <div className="flex flex-col pb-8">
      <BuyerCatalogLandingHeader searchValue={searchQuery} onSearchChange={setSearchQuery} searchLoading={searchQueryResult.isFetching} />

      <BuyerCatalogDesktopLayout contentClassName="space-y-0 px-3">
        {isSearching ? (
          <CatalogSearchResults
            loading={searchLoading}
            error={searchError}
            onRetry={() => { void searchQueryResult.refetch(); }}
            items={searchItems}
            query={debouncedSearch}
            loadingMore={searchLoadingMore}
            sentinelIndex={searchSentinelIndex}
            sentinelRef={searchSentinelRef}
          />
        ) : allSectionsFailed ? (
          <p className="px-1 pt-4 text-center text-sm text-[var(--danger-500)]">
            Could not load catalog. Pull to retry or search above.
          </p>
        ) : (
          <>
            {showPromotionsSkeleton || promotions.length > 0 ? (
              <section className="pt-8 lg:pt-10">
                <BuyerSectionRow title="Campaigns" className="px-1 pb-3" />
                {showPromotionsSkeleton ? (
                  <CampaignTilesSkeleton />
                ) : (
                  <BuyerHorizontalScroll className="gap-3 px-1">
                    {promotions.map((promotion, index) => (
                      <CatalogLookbookCard
                        key={promotion.id}
                        id={promotion.id}
                        name={promotion.name}
                        productCount={promotion.product_count}
                        href={`/buy/home/list/${promotion.id}`}
                        validUntil={promotion.valid_until}
                        heroImageUrl={promotion.hero_image_url}
                        hueIndex={index}
                        priority={index === 0}
                        size="compact"
                      />
                    ))}
                  </BuyerHorizontalScroll>
                )}
              </section>
            ) : null}

            {showRecoSkeleton || orderAgainItems.length > 0 ? (
              <section className="pt-14">
                <BuyerSectionRow title="Order Again" className="px-1 pb-3" />
                <BuyerHorizontalScroll className="gap-2.5 px-1">
                  {showRecoSkeleton ? (
                    <ProductRailSkeleton />
                  ) : (
                    orderAgainItems.map((item) => (
                      <ProductCard
                        key={item.tenant_product_id}
                        item={item}
                        variant="compact"
                        className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0`}
                      />
                    ))
                  )}
                </BuyerHorizontalScroll>
              </section>
            ) : null}

            {showRecoSkeleton || bestsellers.length > 0 ? (
              <section className="pt-12">
                <BuyerSectionRow title="Bestsellers" className="px-1 pb-3" />
                <BuyerHorizontalScroll className="gap-2.5 px-1">
                  {showRecoSkeleton ? (
                    <ProductRailSkeleton />
                  ) : (
                    bestsellers.map((item) => (
                      <ProductCard
                        key={item.tenant_product_id}
                        item={item}
                        variant="compact"
                        className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0`}
                      />
                    ))
                  )}
                </BuyerHorizontalScroll>
              </section>
            ) : null}

            {showCatalogsSkeleton || catalogs.length > 0 ? (
              <section className="pt-12">
                <BuyerSectionRow title="Catalogs" href="/buy/promotions" linkLabel="See all" className="px-1 pb-3" />
                {showCatalogsSkeleton ? (
                  <CatalogRailSkeleton />
                ) : (
                  <BuyerHorizontalScroll className="gap-3 px-1">
                    {catalogs.map((catalog, index) => (
                      <CatalogLookbookCard
                        key={catalog.id}
                        id={catalog.id}
                        name={catalog.name}
                        productCount={catalog.product_count}
                        href={`/buy/home/list/${catalog.id}`}
                        validUntil={catalog.valid_until}
                        heroImageUrl={catalog.hero_image_url}
                        hueIndex={index}
                        priority={index === 0}
                      />
                    ))}
                  </BuyerHorizontalScroll>
                )}
              </section>
            ) : null}

            {showBrandsSkeleton || brands.length > 0 ? (
              <section className="pt-12">
                <BuyerSectionRow title="Brands" className="px-1 pb-3" />
                {showBrandsSkeleton ? (
                  <BrandScrollSkeleton />
                ) : (
                  <BuyerHorizontalScroll className="items-stretch gap-2 px-1">
                    {brands.slice(0, 24).map((brand) => (
                      <DiscoveryThumbTile
                        key={brand.id}
                        href={`/buy/home/brand/${brand.id}`}
                        label={brand.name}
                        imageUrl={brand.logo_url}
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
              <section className="pt-12 pb-4">
                <BuyerSectionRow title="Categories" className="px-1 pb-3" />
                {showCategoriesSkeleton ? (
                  <CategoryGridSkeleton />
                ) : (
                  <div className={BUYER_PRODUCT_GRID_CLASS}>
                    {categories.map((category) => (
                      <DiscoveryThumbTile
                        key={category.id}
                        href={`/buy/home/category/${category.id}`}
                        label={category.name}
                        imageUrl={category.image_url}
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
  onRetry,
  items,
  query,
  loadingMore = false,
  sentinelIndex = -1,
  sentinelRef,
}: {
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
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
      <section className="pt-3 pb-4">
        <CatalogSearchErrorState onRetry={onRetry} />
      </section>
    );
  }
  if (items.length === 0) {
    return (
      <section className="pt-3 pb-4">
        <CatalogSearchEmptyState query={query} />
      </section>
    );
  }
  return (
    <section className="pt-3 pb-4">
      <ProductGrid items={items} loadingMore={loadingMore} sentinelIndex={sentinelIndex} sentinelRef={sentinelRef} />
    </section>
  );
}

function CampaignTilesSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-1" role="status" aria-label="Loading campaigns">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            BUYER_LOOKBOOK_COMPACT_CAROUSEL_WIDTH_CLASS,
            'shrink-0 overflow-hidden border border-cream-200 bg-cream-50',
            BUYER_CARD_RADIUS_CLASS,
          )}
        >
          <div className={cn('w-full animate-pulse bg-cream-100', BUYER_LOOKBOOK_ASPECT_CLASS)} />
          <div className="space-y-2 bg-white px-3.5 py-3">
            <div className={cn('animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogRailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-1" role="status" aria-label="Loading catalogs">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className={cn('w-[280px] shrink-0 overflow-hidden border border-cream-200 bg-cream-50', BUYER_CARD_RADIUS_CLASS)}>
          <div className={cn('w-full animate-pulse bg-cream-100', BUYER_LOOKBOOK_ASPECT_CLASS)} />
          <div className="space-y-2 bg-white px-5 py-4">
            <div className={cn('animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)} />
            <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductRailSkeleton() {
  return (
    <BuyerHorizontalScroll className="gap-2.5 px-1" role="status" aria-label="Loading recommendations">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0 overflow-hidden border border-cream-200 bg-cream-50 ${BUYER_CARD_RADIUS_CLASS}`}>
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="px-2 pb-2 pt-1.5">
            <div className={`${BUYER_TWO_LINE_TITLE_CLASS} min-h-[2.4em] animate-pulse rounded bg-cream-200`} />
            <div className="mt-1 h-4 w-16 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </BuyerHorizontalScroll>
  );
}

function BrandScrollSkeleton() {
  return (
    <div className="flex gap-2 overflow-hidden px-1" role="status" aria-label="Loading brands">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex w-[calc((100vw-2.5rem)/3)] max-w-[124px] shrink-0 flex-col items-center"
        >
          <div className="aspect-square w-full animate-pulse rounded-full border border-cream-200 bg-cream-100" />
          <div className="mt-1.5 h-4 w-3/4 animate-pulse rounded bg-cream-200" />
        </div>
      ))}
    </div>
  );
}

function CategoryGridSkeleton() {
  return (
    <div className={cn(BUYER_PRODUCT_GRID_CLASS, 'lg:hidden')} role="status" aria-label="Loading categories">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className={cn(BUYER_TILE_FRAME_CLASS, BUYER_CARD_RADIUS_CLASS)}
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="flex flex-col px-3 pt-2.5">
            <div className={cn('animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)} />
          </div>
        </div>
      ))}
    </div>
  );
}
