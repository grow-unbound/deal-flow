'use client';

import * as React from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { buildBuyerSearchHref } from '@/lib/buyer-routes';
import type { BuyerCatalogItem, BuyerCatalogResponse } from '@/types/buyer';

export type CatalogFilteredMode = 'category' | 'brand' | 'list';

interface CatalogFilteredBrowseProps {
  mode: CatalogFilteredMode;
  id: string;
}

const PAGE_SIZE = 40;

export function CatalogFilteredBrowse({ mode, id }: CatalogFilteredBrowseProps): React.ReactNode {
  const [title, setTitle] = React.useState<string>(
    mode === 'category' ? 'Category' : mode === 'brand' ? 'Brand' : 'Catalog',
  );
  const [items, setItems] = React.useState<BuyerCatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const searchHref = React.useMemo(() => {
    if (mode === 'category') return buildBuyerSearchHref({ category_id: id });
    if (mode === 'brand') return buildBuyerSearchHref({ brand_id: id });
    return buildBuyerSearchHref({ catalog_id: id });
  }, [mode, id]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setItems([]);
    setOffset(0);
    setHasMore(false);

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: '0',
    });
    if (mode === 'category') params.set('category_id', id);
    if (mode === 'brand') params.set('brand_id', id);
    if (mode === 'list') params.set('catalog_id', id);

    apiFetch(`/api/buyer/catalog?${params.toString()}`)
      .then((r) => r.json() as Promise<BuyerCatalogResponse>)
      .then((data) => {
        if (cancelled) return;
        const next = data.items ?? [];
        setItems(next);
        setOffset(next.length);
        setHasMore(data.has_more ?? false);
        if (mode === 'list' && data.selected_catalog_name) {
          setTitle(data.selected_catalog_name);
        } else {
          const first = next[0];
          if (mode === 'category' && first?.category_name) setTitle(first.category_name);
          if (mode === 'brand' && first?.brand_name) setTitle(first.brand_name);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, id, retryNonce]);

  function handleLoadMore(): void {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (mode === 'category') params.set('category_id', id);
    if (mode === 'brand') params.set('brand_id', id);
    if (mode === 'list') params.set('catalog_id', id);

    apiFetch(`/api/buyer/catalog?${params.toString()}`)
      .then((r) => r.json() as Promise<BuyerCatalogResponse>)
      .then((data) => {
        const next = data.items ?? [];
        setItems((prev) => [...prev, ...next]);
        setOffset((o) => o + next.length);
        setHasMore(data.has_more ?? false);
      })
      .catch(() => setError(true))
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className="flex min-h-[50vh] flex-col pb-[var(--tab-bar)]">
      <BuyerDetailShell title={title} searchHref={searchHref}>
        {loading ? (
          <LoadingSkeleton count={6} />
        ) : error ? (
          <div className="p-4">
            <ErrorState
              heading="Couldn't load products"
              description="Check your connection and try again."
              onRetry={() => setRetryNonce((n) => n + 1)}
            />
          </div>
        ) : (
          <>
            {/* Toolbar row — count + sort */}
            {items.length > 0 && (
              <div
                className="flex items-center justify-between px-2 pb-2 pt-2"
                style={{ borderBottom: '1px solid var(--border-1)' }}
              >
                <span className="text-xs font-medium" style={{ color: 'var(--fg-3)' }}>
                  {items.length + (hasMore ? '+' : '')} products
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ border: '1px solid var(--border-1)', color: 'var(--fg-2)', background: 'var(--bg-surface)' }}
                >
                  Sort: Default ▾
                </button>
              </div>
            )}
            <div className="px-2 pt-2">
              <ProductGrid items={items} />
            </div>
            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm" style={{ color: 'var(--fg-3)' }}>
                No products in this view.
              </p>
            ) : null}
            {hasMore ? (
              <div className="px-2 pb-6">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-60"
                  style={{ borderColor: 'var(--border-1)', background: 'var(--bg-surface)', color: 'var(--fg-2)' }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </BuyerDetailShell>
    </div>
  );
}
