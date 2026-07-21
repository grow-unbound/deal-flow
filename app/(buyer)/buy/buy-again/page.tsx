'use client';

import * as React from 'react';

import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { ErrorState } from '@/components/ui/empty-state';
import { buildBuyerSearchHref } from '@/lib/buyer-routes';
import { useBuyerReorderData } from '@/hooks/useBuyerProducts';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
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

function mergeReorderItems(payload: ReorderPayload | null): BuyerCatalogItem[] {
  if (!payload) return [];
  const merged = new Map<string, BuyerCatalogItem>();
  for (const order of payload.recent_orders) {
    for (const item of order.items) merged.set(item.tenant_product_id, item);
  }
  for (const group of payload.by_category) {
    for (const item of group.items) merged.set(item.tenant_product_id, item);
  }
  return Array.from(merged.values());
}

export default function BuyAgainPage() {
  const { state, setState } = useRouteSnapshot({
    storageKey: 'buyer-buy-again-page',
    initialState: {
      payload: null as ReorderPayload | null,
    },
  });
  const payload = state.payload;
  const reorderQuery = useBuyerReorderData();
  const loading = !payload && reorderQuery.isLoading;
  const error = reorderQuery.isError;

  useRouteScrollRestoration({
    storageKey: 'buyer-buy-again-page',
    ready: !loading,
  });

  React.useEffect(() => {
    if (!payload && reorderQuery.data) {
      setState((current) => ({ ...current, payload: reorderQuery.data as ReorderPayload }));
    }
  }, [payload, reorderQuery.data, setState]);

  const items = React.useMemo(() => mergeReorderItems(payload), [payload]);

  return (
    <div className="flex min-h-[50dvh] flex-col pb-[var(--tab-bar)]">
      <BuyerDetailShell title="Order again" searchHref={buildBuyerSearchHref({ scope: 'buy-again' })}>
        {loading ? (
          <div className="space-y-4 px-4 py-4">
            <div className="h-5 w-28 animate-pulse rounded bg-cream-200" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-[4/5] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState
              heading="Couldn't load reorder list"
              description="Check your connection and try again."
              onRetry={() => {
                setState((current) => ({ ...current, payload: null }));
                void reorderQuery.refetch();
              }}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-5">
            <div className="rounded-[12px] border border-emerald-200/80 bg-emerald-50/90 px-4 py-5 shadow-sm">
              <p className="font-[var(--font-display)] text-lg font-semibold text-[var(--fg-1)]">Reordering will be easy</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg-3)]">
                Items you order will show up here so you can buy them again easily.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            <p className="mb-3 text-sm text-[var(--fg-3)]">
              Your recent products, ready to add back to cart.
            </p>
            <ProductGrid items={items} />
          </div>
        )}
      </BuyerDetailShell>
    </div>
  );
}
