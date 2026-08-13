'use client';

import * as React from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { BuyerCatalogDesktopLayout } from '@/components/buyer/catalog/BuyerCatalogDesktopLayout';
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
import { useTwoPhaseProductGrid } from '@/hooks/useTwoPhaseProductGrid';
import {
  useBuyerBrands,
  useBuyerCatalogListTextInfinite,
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
  const [activeId, setActiveId] = React.useState(id);
  const [resolvedGridId, setResolvedGridId] = React.useState(id);
  const debouncedSearch = useDebounce(search, 300);
  const searchEventKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setActiveId(id);
    setResolvedGridId(id);
  }, [id]);

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
  } = useBuyerCategoryRecos(mode === 'category' ? activeId : '');
  const {
    data: brandRecos,
    isLoading: brandRecosLoading,
    refetch: refetchBrandRecos,
  } = useBuyerBrandRecos(mode === 'brand' ? activeId : '');

  const listQuery = useBuyerCatalogListTextInfinite(mode, activeId, debouncedSearch);
  const pages = listQuery.data?.pages ?? [];
  const textItems = React.useMemo(() => pages.flatMap((page) => page.items ?? []), [pages]);
  const resetKey = React.useMemo(() => `${mode}:${activeId}:${debouncedSearch}`, [mode, activeId, debouncedSearch]);
  const { shownItems: items, registerItemRef } = useTwoPhaseProductGrid(textItems, resetKey);
  const hasMore = pages.at(-1)?.has_more ?? false;
  const isSwitchingEntity = mode !== 'list' && activeId !== resolvedGridId;
  // Cold-cache only, plus detail-rail switches where we want the grid to show an explicit refresh state.
  const showProductsSkeleton = (listQuery.isLoading && items.length === 0) || (isSwitchingEntity && listQuery.isFetching);
  const productsError = listQuery.isError && items.length === 0;
  const loadingMore = listQuery.isFetchingNextPage;

  React.useEffect(() => {
    if (listQuery.isFetching) return;
    setResolvedGridId(activeId);
  }, [activeId, listQuery.isFetching]);

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
    const key = `${mode}:${activeId}:${debouncedSearch}:${items.length}:${listQuery.isError ? 'error' : 'ok'}`;
    if (searchEventKeyRef.current === key) return;
    searchEventKeyRef.current = key;
    posthog.capture('buyer_catalog_search_results_viewed', {
      source_surface: 'catalog_filtered_browse',
      browse_mode: mode,
      entity_id: activeId,
      query_length: debouncedSearch.length,
      result_count: items.length,
      has_more: hasMore,
      status: listQuery.isError ? 'error' : 'success',
    });
  }, [activeId, debouncedSearch, hasMore, items.length, listQuery.isError, listQuery.isFetching, mode, posthog]);

  const selectedCategoryName = categories?.find((c) => c.id === activeId)?.name;
  const selectedBrandName = brands?.find((b) => b.id === activeId)?.name;
  const title =
    mode === 'category'
      ? (selectedCategoryName ?? 'Category')
      : mode === 'brand'
        ? (selectedBrandName ?? 'Brand')
        : campaignTitle;

  const searchPlaceholder =
    mode === 'brand'
      ? `Search ${selectedBrandName ?? 'brand'} products`
      : mode === 'category'
        ? `Search products in ${selectedCategoryName ?? 'this category'}`
      : 'Search products in this catalog';

  const handleRailSelect = React.useCallback((nextId: string) => {
    setActiveId(nextId);
    if (typeof window === 'undefined') return;

    const nextPath =
      mode === 'category'
        ? `/buy/catalog/category/${nextId}`
        : `/buy/catalog/brand/${nextId}`;
    window.history.replaceState(window.history.state, '', nextPath);
  }, [mode]);

  const desktopRail =
    mode === 'category' ? (
      showChipsSkeleton ? (
        <DesktopRailSkeleton />
      ) : (categories?.length ?? 0) > 0 ? (
        <BuyerEntityChipNav
          kind="category"
          categories={categories ?? []}
          selectedId={activeId}
          mode="detail"
          variant="rail"
          onSelectId={handleRailSelect}
        />
      ) : null
    ) : mode === 'brand' ? (
      showChipsSkeleton ? (
        <DesktopRailSkeleton />
      ) : (brands?.length ?? 0) > 0 ? (
        <BuyerEntityChipNav
          kind="brand"
          brands={brands ?? []}
          selectedId={activeId}
          mode="detail"
          variant="rail"
          onSelectId={handleRailSelect}
        />
      ) : null
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <BuyerDetailShell
        title={title}
        hideSearch
        hideDesktopHeader
        backFallbackHref="/buy/catalog"
        headerSearch={
          <BuyerCatalogSearchInput
            value={search}
            onChange={setSearch}
            placeholder={searchPlaceholder}
          />
        }
      >
        <BuyerCatalogDesktopLayout rail={desktopRail} splitScroll>
          <div className="hidden px-2 pt-5 md:block lg:px-2 lg:pt-6">
            {mode !== 'list' ? (
              <h1
                className="mb-3 truncate font-semibold text-[var(--fg-1)]"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-page-sm)', letterSpacing: '-0.01em' }}
              >
                {title}
              </h1>
            ) : null}
            <div className="flex items-center gap-3">
              <BuyerCatalogSearchInput
                value={search}
                onChange={setSearch}
                placeholder={searchPlaceholder}
                className="max-w-[34rem]"
              />
            </div>
          </div>

          {mode === 'list' ? (
            <CampaignSummaryBlock message={campaignMessage} validUntil={campaignValidUntil} />
          ) : null}

          {mode === 'category' && (showCategoryRecosSkeleton || (categoryRecos?.length ?? 0) > 0) ? (
            <div className="pt-1 lg:pt-6">
              <RecoSection
                title="Trending in this category"
                widget="w5_category_trending"
                items={categoryRecos ?? []}
                isLoading={showCategoryRecosSkeleton}
              />
            </div>
          ) : null}

          {mode === 'brand' && (showBrandRecosSkeleton || (brandRecos?.length ?? 0) > 0) ? (
            <div className="pt-1 lg:pt-6">
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
                <div className="px-4 pb-3 pt-4 lg:px-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-3)]">
                    Browse
                  </p>
                  <h2
                    className="mt-1 text-base font-semibold text-[var(--fg-1)]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    All Products
                  </h2>
                </div>
              ) : null}

              <ProductGrid
                items={items}
                loading={showProductsSkeleton}
                loadingMore={loadingMore}
                sentinelIndex={sentinelIndex}
                sentinelRef={sentinelRef}
                showPromotionBadge={mode !== 'list'}
                registerItemRef={registerItemRef}
              />

              {!showProductsSkeleton && items.length === 0 ? (
                <NoProductsFoundState />
              ) : null}
            </>
          )}
        </BuyerCatalogDesktopLayout>
      </BuyerDetailShell>
    </div>
  );
}

function NoProductsFoundState(): React.ReactNode {
  return (
    <div className="px-4 py-10">
      <div className="rounded-[20px] border border-[var(--border-1)] bg-[var(--bg-surface)] px-6 py-8 text-center shadow-[var(--shadow-xs)]">
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

function DesktopRailSkeleton(): React.ReactNode {
  return (
    <div className="flex flex-col" role="status" aria-label="Loading desktop filters">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-[88px] flex-col items-center justify-center gap-2 border-b border-cream-200 px-1 py-3 last:border-b-0 sm:min-h-[96px] sm:px-2 lg:min-h-[76px] lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:px-1"
        >
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-[10px] border border-cream-200 bg-[var(--bg-surface)] p-1 sm:h-14 sm:w-14 sm:p-1.5 lg:h-16 lg:w-16 lg:rounded-[12px] lg:p-2">
            <div className="h-full w-full rounded-[8px] bg-cream-200 lg:rounded-[10px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-4 w-14 animate-pulse rounded bg-cream-200 lg:w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
