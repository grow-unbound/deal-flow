'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { Search } from 'lucide-react';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { CatalogSearchEmptyState, CatalogSearchErrorState, CatalogSearchPromptState } from '@/components/buyer/catalog/CatalogSearchState';
import { Spinner } from '@/components/ui/spinner';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useBuyerCatalogSearchInfinite } from '@/hooks/useBuyerProducts';
import { BUYER_INFINITE_SCROLL_RATIO } from '@/lib/buyer-ui';

export function BuyerSearchPageClient() {
  const router = useRouter();
  const posthog = usePostHog();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') ?? 'catalog';
  const categoryId = searchParams.get('category_id') ?? '';
  const brandId = searchParams.get('brand_id') ?? '';
  const catalogId = searchParams.get('campaign_id') ?? '';
  const urlQ = searchParams.get('q') ?? '';

  const [q, setQ] = React.useState(urlQ);
  const [debounced, setDebounced] = React.useState(urlQ.trim());
  const searchEventKeyRef = React.useRef<string | null>(null);

  // Stay in sync with the URL — the persistent desktop header owns the actual
  // input there and drives searches by pushing `q` into this same route.
  React.useEffect(() => {
    setQ(urlQ);
    setDebounced(urlQ.trim());
  }, [urlQ]);

  const catalogSearchQuery = useBuyerCatalogSearchInfinite(
    debounced,
    {
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      campaignId: catalogId || undefined,
    },
    true,
  );

  const catalogPages = catalogSearchQuery.data?.pages ?? [];
  const shownItems = React.useMemo(
    () => catalogPages.flatMap((page) => page.items ?? []),
    [catalogPages],
  );
  const catalogHasMore = catalogPages.at(-1)?.has_more ?? false;
  const catalogLoadingMore = catalogSearchQuery.isFetchingNextPage;

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  const fetching = catalogSearchQuery.isFetching;
  const initialLoading = fetching && shownItems.length === 0;
  const error = catalogSearchQuery.isError;

  const sentinelIndex = getSentinelInsertIndex(shownItems.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: catalogHasMore,
    isLoading: catalogLoadingMore,
    onLoadMore: () => { void catalogSearchQuery.fetchNextPage(); },
  });

  React.useEffect(() => {
    if (!posthog || debounced.length === 0 || fetching) return;
    const key = `${scope}:${debounced}:${shownItems.length}:${error ? 'error' : 'ok'}`;
    if (searchEventKeyRef.current === key) return;
    searchEventKeyRef.current = key;
    posthog.capture('buyer_catalog_search_results_viewed', {
      source_surface: 'search_page',
      search_scope: scope,
      query_length: debounced.length,
      result_count: shownItems.length,
      has_more: catalogHasMore,
      status: error ? 'error' : 'success',
      has_category_filter: Boolean(categoryId),
      has_brand_filter: Boolean(brandId),
      has_campaign_filter: Boolean(catalogId),
    });
  }, [
    brandId,
    catalogHasMore,
    catalogId,
    categoryId,
    debounced,
    error,
    fetching,
    posthog,
    scope,
    shownItems.length,
  ]);

  function handleClose(): void {
    navigateBuyerBack(router);
  }

  function handleChange(value: string): void {
    setQ(value);
  }

  return (
    <div className="flex min-h-[50dvh] flex-col bg-[var(--bg-base)] pb-[var(--tab-bar)] md:pb-0">
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 px-3 backdrop-blur-md md:hidden">
        <button
          type="button"
          onClick={handleClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--bg-surface)]"
          aria-label="Close search"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--border-1)] bg-[var(--bg-recessed)] px-3 py-2.5">
          {fetching ? <Spinner size="sm" className="shrink-0 text-[var(--fg-3)]" /> : <Search className="h-4 w-4 shrink-0 text-[var(--fg-3)]" aria-hidden />}
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search products, SKU, brand…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--fg-1)] outline-none"
            aria-label="Search"
          />
        </div>
      </header>
      {/* Spacer for the fixed header above — md:hidden matches the header's own breakpoint gate. */}
      <div className="h-14 shrink-0 md:hidden" aria-hidden />
      <div className="flex-1 px-0 pt-2">
        {initialLoading ? (
          <ProductGrid items={[]} loading />
        ) : error ? (
          <CatalogSearchErrorState onRetry={() => { void catalogSearchQuery.refetch(); }} />
        ) : shownItems.length === 0 && !debounced ? (
          <CatalogSearchPromptState />
        ) : shownItems.length === 0 ? (
          <CatalogSearchEmptyState query={debounced} />
        ) : (
          <ProductGrid
            items={shownItems}
            loadingMore={catalogLoadingMore}
            sentinelIndex={sentinelIndex}
            sentinelRef={sentinelRef}
          />
        )}
      </div>
    </div>
  );
}
