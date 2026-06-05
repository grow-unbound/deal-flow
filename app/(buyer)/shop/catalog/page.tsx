'use client';

import * as React from 'react';
import { SearchBar } from '@/components/buyer/catalog/SearchBar';
import { CategoryFilter } from '@/components/buyer/catalog/CategoryFilter';
import { BrandFilter } from '@/components/buyer/catalog/BrandFilter';
import { CatalogPageHeader } from '@/components/buyer/catalog/CatalogPageHeader';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import type { BuyerCatalogItem, BuyerBrand, BuyerCategory } from '@/types/buyer';

const PAGE_LIMIT = 40;

export default function CatalogPage() {
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'buyer-catalog-page',
    initialState: {
      search: '',
      selectedCategory: null as string | null,
      selectedBrand: null as string | null,
      items: [] as BuyerCatalogItem[],
      categories: [] as BuyerCategory[],
      page: 0,
      hasMore: false,
    },
  });
  const search = routeState.search;
  const selectedCategory = routeState.selectedCategory;
  const selectedBrand = routeState.selectedBrand;
  const items = routeState.items;
  const categories = routeState.categories;
  const page = routeState.page;
  const hasMore = routeState.hasMore;
  const [loading, setLoading] = React.useState(items.length === 0);
  const [loadingMore, setLoadingMore] = React.useState(false);
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

  // Fetch categories once on mount
  React.useEffect(() => {
    fetch('/api/buyer/categories')
      .then((r) => r.json())
      .then((data: { categories?: BuyerCategory[] }) => {
        setRouteState((current) => ({ ...current, categories: data.categories ?? [] }));
      })
      .catch((err) => console.error('[CatalogPage] categories fetch error:', err));
  }, []);

  // Fetch products on filter change (reset)
  React.useEffect(() => {
    let cancelled = false;
    const hasCachedItems = routeState.items.length > 0;
    setLoading(!hasCachedItems);

    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: '0',
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedCategory) params.set('category_id', selectedCategory);
    if (selectedBrand) params.set('brand_id', selectedBrand);

    fetch(`/api/buyer/catalog?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { items?: BuyerCatalogItem[]; has_more?: boolean }) => {
        if (cancelled) return;
        setRouteState((current) => ({
          ...current,
          items: data.items ?? [],
          hasMore: data.has_more ?? false,
          page: 1,
        }));
      })
      .catch((err) => console.error('[CatalogPage] initial fetch error:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, selectedCategory, selectedBrand]);

  // Load more (infinite scroll)
  const loadMore = React.useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const offset = page * PAGE_LIMIT;
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedCategory) params.set('category_id', selectedCategory);
    if (selectedBrand) params.set('brand_id', selectedBrand);

    fetch(`/api/buyer/catalog?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { items?: BuyerCatalogItem[]; has_more?: boolean }) => {
        setRouteState((current) => ({
          ...current,
          items: [...current.items, ...(data.items ?? [])],
          hasMore: data.has_more ?? false,
          page: current.page + 1,
        }));
      })
      .catch((err) => console.error('[CatalogPage] load more error:', err))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, page, debouncedSearch, selectedCategory, selectedBrand]);

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
  const catalogName = items[0]?.catalog_name ?? 'Catalog';
  const catalogValidUntil = items[0]?.catalog_valid_until ?? null;

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

  return (
    <div className="flex flex-col pb-[var(--tab-bar)]">
      {/* Sticky search */}
      <div className="sticky top-0 z-10 bg-[var(--bg-base)] border-b border-[var(--border-1)] px-4 py-3">
        <SearchBar
          value={search}
          onChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        />
      </div>

      {/* Filters */}
      <div className="pt-3 pb-1 flex flex-col gap-2">
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onChange={(value) => setRouteState((current) => ({ ...current, selectedCategory: value }))}
        />
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
        />
      )}

      {/* Content */}
      <div className="pt-3">
        {loading ? (
          <LoadingSkeleton count={6} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center gap-3">
            <p className="text-3xl">&#x1F50D;</p>
            <p className="text-base font-semibold text-[var(--fg-1)]">No products found</p>
            <p className="text-sm text-[var(--fg-3)]">Try adjusting your search or filters</p>
            {hasActiveFilters && (
              <button
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
        {loadingMore && (
          <div className="flex justify-center py-6">
            <div className="h-5 w-5 rounded-full border-2 border-[var(--teal-500)] border-t-transparent animate-spin" />
          </div>
        )}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>
    </div>
  );
}
