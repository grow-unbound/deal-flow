'use client';

import * as React from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { CategoryFilter } from '@/components/buyer/catalog/CategoryFilter';
import { BrandFilter } from '@/components/buyer/catalog/BrandFilter';
import { CatalogPageHeader } from '@/components/buyer/catalog/CatalogPageHeader';
import { BuyerLandingHeader } from '@/components/buyer/layout/BuyerLandingHeader';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useCart } from '@/contexts/BuyerCartContext';
import { ErrorState } from '@/components/ui/empty-state';
import type { BuyerCatalogItem, BuyerBrand, BuyerCategory, BuyerCatalogSummary } from '@/types/buyer';

const PAGE_LIMIT = 40;

export function CatalogShareTokenView({ shareToken }: { shareToken: string }) {
  const { setCampaignId } = useCart();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'buyer-catalog-page',
    initialState: {
      search: '',
      selectedCategory: null as string | null,
      selectedBrand: null as string | null,
      items: [] as BuyerCatalogItem[],
      categories: [] as BuyerCategory[],
      catalogs: [] as BuyerCatalogSummary[],
      page: 0,
      hasMore: false,
      shareCatalogName: null as string | null,
      shareCatalogValidUntil: null as string | null,
      selectedCatalogId: null as string | null,
      loadedShareToken: null as string | null,
    },
  });
  const search = routeState.search;
  const selectedCategory = routeState.selectedCategory;
  const selectedBrand = routeState.selectedBrand;
  const items = routeState.items;
  const categories = routeState.categories;
  const catalogs = routeState.catalogs;
  const page = routeState.page;
  const hasMore = routeState.hasMore;
  const shareCatalogName = routeState.shareCatalogName;
  const shareCatalogValidUntil = routeState.shareCatalogValidUntil;
  const selectedCatalogId = routeState.selectedCatalogId;
  const loadedShareToken = routeState.loadedShareToken;
  const [loading, setLoading] = React.useState(items.length === 0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [categoriesFetchError, setCategoriesFetchError] = React.useState(false);
  const [listFetchError, setListFetchError] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState(false);
  const [categoriesRetryNonce, setCategoriesRetryNonce] = React.useState(0);
  const [catalogFetchNonce, setCatalogFetchNonce] = React.useState(0);
  useRouteScrollRestoration({
    storageKey: 'buyer-catalog-page',
    ready: !loading,
  });

  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const observerRef = React.useRef<IntersectionObserver | null>(null);

  // Debounce search input
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch categories once on mount (retry via categoriesRetryNonce)
  React.useEffect(() => {
    setCategoriesFetchError(false);
    const params = new URLSearchParams();
    if (shareToken) params.set('share_token', shareToken);
    if (!shareToken && selectedCatalogId) params.set('campaign_id', selectedCatalogId);
    apiFetch(`/api/buyer/categories${params.toString() ? `?${params.toString()}` : ''}`)
      .then((r) => r.json() as Promise<{ categories?: BuyerCategory[] }>)
      .then((data) => {
        setRouteState((current) => ({ ...current, categories: data.categories ?? [] }));
      })
      .catch(() => setCategoriesFetchError(true));
  }, [categoriesRetryNonce, selectedCatalogId, setRouteState, shareToken]);

  const itemsLengthRef = React.useRef(items.length);
  itemsLengthRef.current = items.length;

  // Fetch products on filter change (reset); catalogFetchNonce forces retry after error
  React.useEffect(() => {
    let cancelled = false;
    setListFetchError(false);
    setLoading(itemsLengthRef.current === 0);

    if (shareToken) {
      apiFetch(`/api/buyer/catalog/${shareToken}`)
        .then((r) => r.json() as Promise<{ campaign_id?: string; name?: string; valid_until?: string | null; items?: BuyerCatalogItem[] }>)
        .then((data) => {
          if (cancelled) return;
          setRouteState((current) => ({
            ...current,
            items: data.items ?? [],
            hasMore: false,
            page: 1,
            shareCatalogName: data.name ?? 'Catalog',
            shareCatalogValidUntil: data.valid_until ?? null,
            loadedShareToken: shareToken,
          }));
          if (data.campaign_id) {
            setCampaignId(data.campaign_id);
          }
        })
        .catch(() => {
          if (!cancelled) setListFetchError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: '0',
    });
    if (selectedCatalogId) params.set('campaign_id', selectedCatalogId);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedCategory) params.set('category_id', selectedCategory);
    if (selectedBrand) params.set('brand_id', selectedBrand);

    apiFetch(`/api/buyer/catalog?${params.toString()}`)
      .then((r) => r.json() as Promise<{
        items?: BuyerCatalogItem[];
        has_more?: boolean;
        catalogs?: BuyerCatalogSummary[];
        selected_campaign_id?: string | null;
        selected_campaign_name?: string | null;
        selected_campaign_valid_until?: string | null;
      }>)
      .then((data) => {
        if (cancelled) return;
        setRouteState((current) => ({
          ...current,
          items: data.items ?? [],
          catalogs: data.catalogs ?? current.catalogs,
          hasMore: data.has_more ?? false,
          page: 1,
          shareCatalogName: data.selected_campaign_name ?? null,
          shareCatalogValidUntil: data.selected_campaign_valid_until ?? null,
          selectedCatalogId: data.selected_campaign_id ?? current.selectedCatalogId,
          loadedShareToken: null,
        }));
        const nextCampaignId = data.selected_campaign_id ?? selectedCatalogId;
        if (nextCampaignId) {
          setCampaignId(nextCampaignId);
        }
      })
      .catch(() => {
        if (!cancelled) setListFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, selectedCategory, selectedBrand, selectedCatalogId, shareToken, catalogFetchNonce, setRouteState]);

  // Load more (infinite scroll)
  const loadMore = React.useCallback(() => {
    if (shareToken || loadingMore || !hasMore) return;
    setLoadMoreError(false);
    setLoadingMore(true);

    const offset = page * PAGE_LIMIT;
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    if (selectedCatalogId) params.set('campaign_id', selectedCatalogId);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedCategory) params.set('category_id', selectedCategory);
    if (selectedBrand) params.set('brand_id', selectedBrand);

    apiFetch(`/api/buyer/catalog?${params.toString()}`)
      .then((r) => r.json() as Promise<{ items?: BuyerCatalogItem[]; has_more?: boolean }>)
      .then((data) => {
        setRouteState((current) => ({
          ...current,
          items: [...current.items, ...(data.items ?? [])],
          hasMore: data.has_more ?? false,
          page: current.page + 1,
        }));
      })
      .catch(() => setLoadMoreError(true))
      .finally(() => setLoadingMore(false));
  }, [shareToken, loadingMore, hasMore, page, debouncedSearch, selectedCategory, selectedBrand, selectedCatalogId, setRouteState]);

  // Intersection observer for sentinel
  React.useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMore]);

  // Derive brands from loaded items
  const brands = React.useMemo<BuyerBrand[]>(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.brand_id && item.brand_name && !seen.has(item.brand_id)) {
        seen.set(item.brand_id, item.brand_name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  // Catalog name/date from first item
  const catalogName = shareToken ? (shareCatalogName ?? 'Campaign') : (items[0]?.campaign_name ?? 'Catalog');
  const catalogValidUntil = shareToken ? shareCatalogValidUntil : (items[0]?.campaign_valid_until ?? null);

  const hasActiveFilters =
    selectedCategory !== null || selectedBrand !== null || debouncedSearch !== '';

  function clearFilters() {
    setRouteState((current) => ({
      ...current,
      search: '',
      selectedCategory: null,
      selectedBrand: null,
    }));
  }

  React.useEffect(() => {
    if (loadedShareToken === shareToken) return;
    setRouteState((current) => ({
      ...current,
      items: [],
      page: 0,
      hasMore: false,
      shareCatalogName: null,
      shareCatalogValidUntil: null,
      loadedShareToken: null,
    }));
  }, [loadedShareToken, setRouteState, shareToken]);

  const searchExtraParams = React.useMemo(
    () => ({
      campaign_id: selectedCatalogId ?? items[0]?.campaign_id ?? undefined,
      category_id: selectedCategory ?? undefined,
      brand_id: selectedBrand ?? undefined,
    }),
    [selectedCatalogId, items, selectedCategory, selectedBrand],
  );

  return (
    <div className="flex flex-col pb-[var(--tab-bar)]">
      <BuyerLandingHeader
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        searchPlaceholder="Search products, SKU, brand…"
        searchScope="catalog"
        searchExtraParams={searchExtraParams}
        showCategoryChips
        showProfile={false}
        categoryChips={
          <CategoryFilter
            categories={categories}
            selected={selectedCategory}
            onChange={(value) => setRouteState((current) => ({ ...current, selectedCategory: value }))}
          />
        }
      />

      {/* Brand filter (categories live in header chips) */}
      <div className="pt-3 pb-1 flex flex-col gap-2">
        {categoriesFetchError && (
          <div className="px-4">
            <ErrorState
              heading="Couldn't load categories"
              description="Filters may be limited until this loads."
              onRetry={() => setCategoriesRetryNonce((n) => n + 1)}
            />
          </div>
        )}
        {brands.length > 0 && (
          <BrandFilter
            brands={brands}
            selected={selectedBrand}
            onChange={(value) => setRouteState((current) => ({ ...current, selectedBrand: value }))}
          />
        )}
      </div>

      {/* Header */}
      {!loading && items.length > 0 && (
        <CatalogPageHeader
          name={catalogName}
          productCount={items.length}
          validUntil={catalogValidUntil}
          catalogs={catalogs}
          selectedCatalogId={selectedCatalogId}
          onSelectCatalog={(catalogId) =>
            setRouteState((current) => ({
              ...current,
              selectedCatalogId: catalogId,
              selectedBrand: null,
              selectedCategory: null,
              items: [],
              page: 0,
              hasMore: false,
            }))
          }
        />
      )}

      {/* Content */}
      <div className="pt-3">
        {loading ? (
          <LoadingSkeleton count={6} />
        ) : listFetchError && items.length === 0 ? (
          <div className="px-4">
            <ErrorState
              heading="Couldn't load catalog"
              description="Check your connection and try again."
              onRetry={() => setCatalogFetchNonce((n) => n + 1)}
            />
          </div>
        ) : (
          <>
            {listFetchError && items.length > 0 && (
              <div className="px-4 pb-3">
                <ErrorState
                  heading="Couldn't refresh results"
                  description="Showing the previous list. Try again to update."
                  onRetry={() => setCatalogFetchNonce((n) => n + 1)}
                />
              </div>
            )}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center gap-3">
                <p className="text-3xl">&#x1F50D;</p>
                <p className="text-base font-semibold text-[var(--fg-1)]">No products found</p>
                <p className="text-sm text-[var(--fg-3)]">Try adjusting your search or filters</p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 text-sm font-medium text-[var(--teal-500)] border border-[var(--teal-500)] rounded-full px-4 py-1.5 hover:bg-[var(--teal-500)] hover:text-white transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <ProductGrid items={items} />
            )}

            {/* Load more indicator */}
            {loadMoreError && !shareToken && items.length > 0 && (
              <div className="px-4 py-4">
                <ErrorState
                  heading="Couldn't load more"
                  description="Scroll up and try again, or adjust filters."
                  onRetry={() => loadMore()}
                />
              </div>
            )}
            {loadingMore && (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 rounded-full border-2 border-[var(--teal-500)] border-t-transparent animate-spin" />
              </div>
            )}
          </>
        )}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>
    </div>
  );
}
