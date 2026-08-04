'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useBuyerCatalogSearchInfinite } from '@/hooks/useBuyerProducts';
import { BUYER_INFINITE_SCROLL_RATIO } from '@/lib/buyer-ui';
import type { BuyerCatalogItem } from '@/types/buyer';

function matchesQuery(item: BuyerCatalogItem, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    item.display_name.toLowerCase().includes(s) ||
    item.internal_sku.toLowerCase().includes(s) ||
    (item.brand_name?.toLowerCase().includes(s) ?? false)
  );
}

export function BuyerSearchPageClient() {
  const router = useRouter();
  const posthog = usePostHog();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') ?? 'catalog';
  const initialQ = searchParams.get('q') ?? '';
  const categoryId = searchParams.get('category_id') ?? '';
  const brandId = searchParams.get('brand_id') ?? '';
  const catalogId = searchParams.get('campaign_id') ?? '';

  const [q, setQ] = React.useState(initialQ);
  const [debounced, setDebounced] = React.useState(initialQ.trim());
  const searchEventKeyRef = React.useRef<string | null>(null);

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
  const catalogItems = React.useMemo(
    () => catalogPages.flatMap((page) => page.items ?? []),
    [catalogPages],
  );
  const catalogHasMore = catalogPages.at(-1)?.has_more ?? false;
  const catalogLoadingMore = catalogSearchQuery.isFetchingNextPage;

  const sentinelIndex = getSentinelInsertIndex(catalogItems.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: catalogHasMore,
    isLoading: catalogLoadingMore,
    onLoadMore: () => { void catalogSearchQuery.fetchNextPage(); },
  });

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  const shownItems = React.useMemo(
    () => catalogItems.filter((item) => matchesQuery(item, q)),
    [catalogItems, q],
  );

  const loading = catalogSearchQuery.isLoading && catalogItems.length === 0;
  const error = catalogSearchQuery.isError;
  const refreshing = catalogSearchQuery.isFetching && catalogItems.length > 0;

  React.useEffect(() => {
    if (!posthog || debounced.length === 0 || loading || refreshing) return;
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
    loading,
    posthog,
    refreshing,
    scope,
    shownItems.length,
  ]);

  function handleClose(): void {
    navigateBuyerBack(router);
  }

  return (
    <div className="flex min-h-[50dvh] flex-col bg-[var(--bg-base)] pb-[var(--tab-bar)]">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 px-3 py-2 backdrop-blur-md">
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
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products, SKU, brand…"
          className="min-w-0 flex-1 rounded-xl border border-[var(--border-1)] bg-[var(--bg-recessed)] px-3 py-2.5 text-sm text-[var(--fg-1)] outline-none focus:border-[var(--teal-500)]"
          aria-label="Search"
        />
      </header>
      <div className="flex-1 px-0 pt-2">
        {refreshing ? (
          <div className="px-4 pb-2 text-xs text-[var(--fg-3)]">Updating results…</div>
        ) : null}
        {loading ? (
          <ProductGrid items={[]} loading />
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--danger-500)]">Could not load results.</div>
        ) : shownItems.length === 0 && !debounced ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">Type to search products</div>
        ) : shownItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">No matches. Try another term.</div>
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
