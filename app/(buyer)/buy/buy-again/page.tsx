'use client';

import * as React from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { BuyerLandingHeader } from '@/components/buyer/layout/BuyerLandingHeader';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { ErrorState } from '@/components/ui/empty-state';
import type { BuyerCatalogItem } from '@/types/buyer';

interface ReorderOrder {
  id: string;
  order_number: string;
  placed_at: string;
  items: BuyerCatalogItem[];
}

interface ReorderCategory {
  category_id: string;
  category_name: string;
  items: BuyerCatalogItem[];
}

interface ReorderPayload {
  has_history: boolean;
  recent_orders: ReorderOrder[];
  by_category: ReorderCategory[];
}

function matchesSearch(item: BuyerCatalogItem, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    item.display_name.toLowerCase().includes(s)
    || item.internal_sku.toLowerCase().includes(s)
    || (item.brand_name?.toLowerCase().includes(s) ?? false)
  );
}

function filterOrders(orders: ReorderOrder[], q: string): ReorderOrder[] {
  return orders
    .map((o) => ({
      ...o,
      items: o.items.filter((i) => matchesSearch(i, q)),
    }))
    .filter((o) => o.items.length > 0);
}

function filterCategories(cats: ReorderCategory[], q: string): ReorderCategory[] {
  return cats
    .map((c) => ({
      ...c,
      items: c.items.filter((i) => matchesSearch(i, q)),
    }))
    .filter((c) => c.items.length > 0);
}

export default function BuyAgainPage() {
  const { state, setState } = useRouteSnapshot({
    storageKey: 'buyer-buy-again-page',
    initialState: {
      search: '',
      payload: null as ReorderPayload | null,
    },
  });
  const search = state.search;
  const payload = state.payload;
  const [loading, setLoading] = React.useState(!payload);
  const [error, setError] = React.useState(false);

  useRouteScrollRestoration({
    storageKey: 'buyer-buy-again-page',
    ready: !loading,
  });

  React.useEffect(() => {
    if (payload) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setError(false);
    apiFetch('/api/buyer/reorder')
      .then((r) => r.json() as Promise<ReorderPayload>)
      .then((data) => {
        if (cancelled) return;
        setState((c) => ({ ...c, payload: data }));
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
  }, [payload, setState]);

  const filteredRecent = React.useMemo(
    () => (payload ? filterOrders(payload.recent_orders, search) : []),
    [payload, search],
  );
  const filteredCategories = React.useMemo(
    () => (payload ? filterCategories(payload.by_category, search) : []),
    [payload, search],
  );

  return (
    <div className="flex flex-col pb-[var(--tab-bar)]">
      <BuyerLandingHeader
        searchValue={search}
        onSearchChange={(value) => setState((c) => ({ ...c, search: value }))}
        searchPlaceholder="Search products, SKU, brand…"
        searchScope="buy-again"
        showProfile
      />

      {loading ? (
        <div className="space-y-4 px-4 py-6">
          <div className="animate-pulse h-24 rounded-xl bg-cream-100 border border-cream-200" />
          <div className="animate-pulse h-40 rounded-xl bg-cream-100 border border-cream-200" />
        </div>
      ) : error ? (
        <div className="px-4 py-8">
          <ErrorState
            heading="Couldn't load reorder list"
            description="Check your connection and try again."
            onRetry={() => {
              setState((c) => ({ ...c, payload: null }));
              setLoading(true);
              setError(false);
              void apiFetch('/api/buyer/reorder')
                .then((r) => r.json() as Promise<ReorderPayload>)
                .then((data) => setState((c) => ({ ...c, payload: data })))
                .catch(() => setError(true))
                .finally(() => setLoading(false));
            }}
          />
        </div>
      ) : !payload?.has_history ? (
        <div className="px-4 py-5">
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-5 shadow-sm">
            <div className="mb-3 text-3xl" aria-hidden>
              🛍️
            </div>
            <p className="font-[var(--font-display)] text-lg font-semibold text-[var(--fg-1)]">Reordering will be easy</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fg-3)]">
              Items you order will show up here so you can buy them again easily.
            </p>
            <Link
              href="/buy/catalog"
              className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--teal-500)] bg-[var(--teal-500)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
            >
              Browse catalog
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="mt-4 px-4">
            <h2 className="mb-3 font-[var(--font-display)] text-base font-semibold text-[var(--fg-1)]">Recent orders</h2>
            <div className="flex flex-col gap-4">
              {filteredRecent.length === 0 ? (
                <p className="text-sm text-[var(--fg-3)]">No products match your search.</p>
              ) : (
                filteredRecent.map((order) => (
                  <div
                    key={order.id}
                    className="overflow-hidden rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface)]"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--border-1)] bg-[var(--bg-recessed)] px-3 py-2">
                      <span className="font-mono text-sm font-medium text-[var(--fg-1)]">{order.order_number}</span>
                      <span className="text-xs text-[var(--fg-3)]">
                        {new Date(order.placed_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <ProductGrid items={order.items} />
                  </div>
                ))
              )}
            </div>
          </section>

          {filteredCategories.map((cat) => (
            <section key={cat.category_id || cat.category_name} className="mt-8 px-0">
              <h2 className="mb-3 px-4 font-[var(--font-display)] text-base font-semibold text-[var(--fg-1)]">
                {cat.category_name}
              </h2>
              <ProductGrid items={cat.items} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
