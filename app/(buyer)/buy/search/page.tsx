'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { markBuyerNavigationBack } from '@/hooks/useBuyerNavigationDirection';
import type { BuyerCatalogItem } from '@/types/buyer';

interface BuyerReorderResponse {
  has_history: boolean;
  recent_orders: Array<{ id: string; order_number: string; placed_at: string; items: BuyerCatalogItem[] }>;
  by_category: Array<{ category_id: string; category_name: string; items: BuyerCatalogItem[] }>;
}

function mergeReorderItems(data: BuyerReorderResponse): BuyerCatalogItem[] {
  const map = new Map<string, BuyerCatalogItem>();
  for (const o of data.recent_orders) {
    for (const i of o.items) {
      map.set(i.tenant_product_id, i);
    }
  }
  for (const c of data.by_category) {
    for (const i of c.items) {
      map.set(i.tenant_product_id, i);
    }
  }
  return Array.from(map.values());
}

function matchesQuery(item: BuyerCatalogItem, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    item.display_name.toLowerCase().includes(s) ||
    item.internal_sku.toLowerCase().includes(s) ||
    (item.brand_name?.toLowerCase().includes(s) ?? false)
  );
}

export default function BuyerSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') ?? 'catalog';
  const initialQ = searchParams.get('q') ?? '';
  const categoryId = searchParams.get('category_id') ?? '';
  const brandId = searchParams.get('brand_id') ?? '';
  const catalogId = searchParams.get('catalog_id') ?? '';

  const [q, setQ] = React.useState(initialQ);
  const [debounced, setDebounced] = React.useState(initialQ.trim());
  const [catalogItems, setCatalogItems] = React.useState<BuyerCatalogItem[]>([]);
  const [buyAgainPool, setBuyAgainPool] = React.useState<BuyerCatalogItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    if (scope === 'buy-again') return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ limit: '60', offset: '0' });
    if (debounced) params.set('search', debounced);
    if (categoryId) params.set('category_id', categoryId);
    if (brandId) params.set('brand_id', brandId);
    if (catalogId) params.set('catalog_id', catalogId);

    apiFetch(`/api/buyer/catalog?${params.toString()}`)
      .then((r) => r.json() as Promise<{ items?: BuyerCatalogItem[] }>)
      .then((data) => {
        if (!cancelled) setCatalogItems(data.items ?? []);
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
  }, [debounced, categoryId, brandId, catalogId, scope]);

  React.useEffect(() => {
    if (scope !== 'buy-again') {
      setBuyAgainPool(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiFetch('/api/buyer/reorder')
      .then((r) => r.json() as Promise<BuyerReorderResponse>)
      .then((data) => {
        if (cancelled) return;
        setBuyAgainPool(mergeReorderItems(data));
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
  }, [scope]);

  const shownItems = React.useMemo(() => {
    if (scope === 'buy-again') {
      const pool = buyAgainPool ?? [];
      return pool.filter((i) => matchesQuery(i, debounced));
    }
    return catalogItems;
  }, [scope, buyAgainPool, debounced, catalogItems]);

  function handleClose(): void {
    markBuyerNavigationBack();
    router.back();
  }

  return (
    <div className="flex min-h-[50vh] flex-col bg-[var(--bg-base)] pb-[var(--tab-bar)]">
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
      <p className="px-4 pt-2 text-xs text-[var(--fg-3)]">
        Scope: <span className="font-medium text-[var(--fg-2)]">{scope}</span>
      </p>
      <div className="flex-1 px-0 pt-2">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">Searching…</div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--danger-500)]">Could not load results.</div>
        ) : shownItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">No matches. Try another term.</div>
        ) : (
          <ProductGrid items={shownItems} />
        )}
      </div>
    </div>
  );
}
