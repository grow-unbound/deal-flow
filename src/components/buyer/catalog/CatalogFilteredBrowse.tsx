'use client';

import * as React from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { BuyerEntityChipNav } from '@/components/buyer/catalog/BuyerEntityChipNav';
import { CampaignSummaryBlock } from '@/components/buyer/catalog/CampaignSummaryBlock';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { RecoSection } from '@/components/buyer/catalog/RecoSection';
import { BuyerCatalogSearchInput } from '@/components/buyer/layout/BuyerCatalogSearchInput';
import { ErrorState } from '@/components/ui/empty-state';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { useDebounce } from '@/hooks/useDebounce';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  useBuyerBrands,
  useBuyerCatalogList,
  useBuyerCategories,
} from '@/hooks/useBuyerProducts';
import { useBuyerBrandRecos, useBuyerCategoryRecos } from '@/hooks/useBuyerCategoryRecos';
import { useCart } from '@/contexts/BuyerCartContext';
import { BUYER_INFINITE_SCROLL_RATIO } from '@/lib/buyer-ui';

export type CatalogFilteredMode = 'category' | 'brand' | 'list';

interface CatalogFilteredBrowseProps {
  mode: CatalogFilteredMode;
  id: string;
}

export function CatalogFilteredBrowse({ mode, id }: CatalogFilteredBrowseProps): React.ReactNode {
  const posthog = usePostHog();
  const { setCampaignId } = useCart();
  const { setRefreshFn } = useBuyerRealtimeContext();
  const [campaignTitle, setCampaignTitle] = React.useState('Catalog');
  const [campaignTitleResolved, setCampaignTitleResolved] = React.useState(false);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search, 300);
  const searchEventKeyRef = React.useRef<string | null>(null);

  const {
    data: categories,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
  } = useBuyerCategories();
  const {
    data: brands,
    isLoading: brandsLoading,
    refetch: refetchBrands,
  } = useBuyerBrands();

  const {
    data: categoryRecos,
    isLoading: categoryRecosLoading,
    refetch: refetchCategoryRecos,
  } = useBuyerCategoryRecos(mode === 'category' ? id : '');
  const {
    data: brandRecos,
    isLoading: brandRecosLoading,
    refetch: refetchBrandRecos,
  } = useBuyerBrandRecos(mode === 'brand' ? id : '');

  const listQuery = useBuyerCatalogList(mode, id, debouncedSearch);
  const pages = listQuery.data?.pages ?? [];
  const items = React.useMemo(() => pages.flatMap((page) => page.items ?? []), [pages]);
  const hasMore = pages.at(-1)?.has_more ?? false;
  // Cold-cache only — keep rendered products during search/refetch.
  const showProductsSkeleton = listQuery.isLoading && items.length === 0;
  const productsError = listQuery.isError && items.length === 0;
  const loadingMore = listQuery.isFetchingNextPage;

  const showCategoryRecosSkeleton = mode === 'category' && categoryRecosLoading && categoryRecos === undefined;
  const showBrandRecosSkeleton = mode === 'brand' && brandRecosLoading && brandRecos === undefined;
  const showChipsSkeleton =
    (mode === 'category' && categoriesLoading && categories === undefined)
    || (mode === 'brand' && brandsLoading && brands === undefined);

  const sentinelIndex = getSentinelInsertIndex(items.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: loadingMore,
    onLoadMore: () => { void listQuery.fetchNextPage(); },
  });

  const firstPage = pages[0];
  const campaignMessage = mode === 'list' ? (firstPage?.selected_campaign_message ?? null) : null;
  const campaignValidUntil = mode === 'list' ? (firstPage?.selected_campaign_valid_until ?? null) : null;

  // Bind cart attribution to the campaign route id immediately — don't wait for catalog API.
  React.useEffect(() => {
    if (mode === 'list' && id) {
      setCampaignId(id);
    }
  }, [mode, id, setCampaignId]);

  React.useEffect(() => {
    if (mode !== 'list' || campaignTitleResolved) return;
    const page = pages[0];
    if (!page?.selected_campaign_name) return;
    setCampaignTitle(page.selected_campaign_name);
    setCampaignTitleResolved(true);
    if (page.selected_campaign_id) {
      setCampaignId(page.selected_campaign_id);
    }
  }, [mode, pages, campaignTitleResolved, setCampaignId]);

  React.useEffect(() => {
    if (mode !== 'list') return;
    setCampaignTitle('Catalog');
    setCampaignTitleResolved(false);
  }, [mode, id, retryNonce]);

  React.useEffect(() => {
    setRefreshFn(async () => {
      const tasks: Array<Promise<unknown>> = [listQuery.refetch()];
      if (mode === 'category') {
        tasks.push(refetchCategories(), refetchCategoryRecos());
      } else if (mode === 'brand') {
        tasks.push(refetchBrands(), refetchBrandRecos());
      }
      await Promise.all(tasks);
    });
    return () => setRefreshFn(null);
  }, [
    listQuery.refetch,
    mode,
    refetchBrandRecos,
    refetchBrands,
    refetchCategories,
    refetchCategoryRecos,
    setRefreshFn,
  ]);

  React.useEffect(() => {
    if (!posthog || debouncedSearch.length === 0 || listQuery.isFetching) return;
    const key = `${mode}:${id}:${debouncedSearch}:${items.length}:${listQuery.isError ? 'error' : 'ok'}`;
    if (searchEventKeyRef.current === key) return;
    searchEventKeyRef.current = key;
    posthog.capture('buyer_catalog_search_results_viewed', {
      source_surface: 'catalog_filtered_browse',
      browse_mode: mode,
      entity_id: id,
      query_length: debouncedSearch.length,
      result_count: items.length,
      has_more: hasMore,
      status: listQuery.isError ? 'error' : 'success',
    });
  }, [debouncedSearch, hasMore, id, items.length, listQuery.isError, listQuery.isFetching, mode, posthog]);

  const selectedCategoryName = categories?.find((c) => c.id === id)?.name;
  const selectedBrandName = brands?.find((b) => b.id === id)?.name;
  const title =
    mode === 'category'
      ? (selectedCategoryName ?? 'Category')
      : mode === 'brand'
        ? (selectedBrandName ?? 'Brand')
        : campaignTitle;

  const stickyToolbar =
    mode === 'category' ? (
      showChipsSkeleton ? (
        <ChipCarouselSkeleton kind="category" />
      ) : (categories?.length ?? 0) > 0 ? (
        <BuyerEntityChipNav
          kind="category"
          categories={categories ?? []}
          selectedId={id}
          mode="detail"
        />
      ) : null
    ) : mode === 'brand' ? (
      showChipsSkeleton ? (
        <ChipCarouselSkeleton kind="brand" />
      ) : (brands?.length ?? 0) > 0 ? (
        <BuyerEntityChipNav
          kind="brand"
          brands={brands ?? []}
          selectedId={id}
          mode="detail"
        />
      ) : null
    ) : null;

  const searchPlaceholder =
    mode === 'brand'
      ? 'Search products in this brand'
      : mode === 'category'
        ? 'Search products in this category'
        : 'Search products in this catalog';

  return (
    <div className="flex min-h-[50dvh] flex-col pb-8">
      <BuyerDetailShell
        title={title}
        hideSearch
        backFallbackHref="/buy/catalog"
        headerSearch={
          <BuyerCatalogSearchInput
            value={search}
            onChange={setSearch}
            placeholder={searchPlaceholder}
          />
        }
        stickyToolbar={stickyToolbar}
      >
        {mode === 'list' ? (
          <CampaignSummaryBlock message={campaignMessage} validUntil={campaignValidUntil} />
        ) : null}

        {mode === 'category' && (showCategoryRecosSkeleton || (categoryRecos?.length ?? 0) > 0) ? (
          <div className="pt-1">
            <RecoSection
              title="Trending in this category"
              widget="w5_category_trending"
              items={categoryRecos ?? []}
              isLoading={showCategoryRecosSkeleton}
            />
          </div>
        ) : null}

        {mode === 'brand' && (showBrandRecosSkeleton || (brandRecos?.length ?? 0) > 0) ? (
          <div className="pt-1">
            <RecoSection
              title="Trending in this brand"
              widget="w6_brand_trending"
              items={brandRecos ?? []}
              isLoading={showBrandRecosSkeleton}
            />
          </div>
        ) : null}

        {productsError ? (
          <div className="p-4">
            <ErrorState
              heading="Couldn't load products"
              description="Check your connection and try again."
              onRetry={() => {
                setRetryNonce((n) => n + 1);
                void listQuery.refetch();
              }}
            />
          </div>
        ) : (
          <>
            {showProductsSkeleton || items.length > 0 ? (
              <div className="px-4 pb-3 pt-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-3)]">
                      Browse
                    </p>
                    <h2
                      className="mt-1 text-lg font-semibold text-[var(--fg-1)]"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      All Products
                    </h2>
                  </div>
                  {showProductsSkeleton ? (
                    <div className="h-4 w-14 shrink-0 animate-pulse rounded bg-cream-200" />
                  ) : (
                    <p className="shrink-0 text-sm text-[var(--fg-3)]">
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            <ProductGrid
              items={items}
              loading={showProductsSkeleton}
              loadingMore={loadingMore}
              sentinelIndex={sentinelIndex}
              sentinelRef={sentinelRef}
              showPromotionBadge={mode !== 'list'}
            />

            {!showProductsSkeleton && items.length === 0 ? (
              <NoProductsFoundState />
            ) : null}
          </>
        )}
      </BuyerDetailShell>
    </div>
  );
}

function ChipCarouselSkeleton({ kind }: { kind: 'category' | 'brand' }): React.ReactNode {
  return (
    <div
      className="flex gap-2 overflow-x-hidden px-4 pb-1 pt-1.5"
      role="status"
      aria-label={kind === 'category' ? 'Loading category filters' : 'Loading brand filters'}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-cream-200" />
      ))}
    </div>
  );
}

function NoProductsFoundState(): React.ReactNode {
  return (
    <div className="px-4 py-10">
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
          Try a different search or switch filters to explore more products.
        </p>
        <Link
          href="/buy/catalog"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--teal-500)] px-5 py-2.5 text-sm font-semibold text-[var(--teal-500)] transition-colors hover:bg-[var(--teal-500)] hover:text-white"
        >
          Browse Catalog
        </Link>
      </div>
    </div>
  );
}
