'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Clock, Search } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';

interface SearchItem {
  id: string;
  label: string;
  sublabel?: string;
  url_path: string;
}

interface SearchGroup {
  entity_type: string;
  items: SearchItem[];
}

interface GlobalSearchResponse {
  groups: SearchGroup[];
  total: number;
}

interface RecentItem extends SearchItem {
  entity_type: string;
}

const RECENT_KEY = 'seller-search-recent';
const MAX_RECENT = 5;

const ENTITY_LABEL: Record<string, string> = {
  product: 'Products',
  brand: 'Brands',
  customer: 'Customers',
  category: 'Categories',
  location: 'Locations',
  warehouse: 'Warehouses',
  cohort: 'Customer Groups',
  campaign: 'Campaigns',
  price_list: 'Price Lists',
  order: 'Orders',
  invoice: 'Invoices',
  estimate: 'Estimates',
};

function loadRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentItem[];
  } catch {
    return [];
  }
}

function saveRecent(item: RecentItem) {
  const existing = loadRecent().filter((recent) => recent.id !== item.id);
  localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...existing].slice(0, MAX_RECENT)));
}

export function SellerMobileSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = React.useState(initialQ);
  const [debounced, setDebounced] = React.useState(initialQ.trim());
  const [result, setResult] = React.useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [recent, setRecent] = React.useState<RecentItem[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setRecent(loadRecent());
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    if (!debounced) {
      setResult(null);
      setLoading(false);
      setError(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(false);
    apiFetch(`/api/tenant/search?q=${encodeURIComponent(debounced)}&limit=8`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Search failed');
        return response.json() as Promise<GlobalSearchResponse>;
      })
      .then((payload) => setResult(payload))
      .catch((searchError) => {
        if (searchError instanceof DOMException && searchError.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debounced]);

  function remember(item: SearchItem, entityType: string) {
    saveRecent({ ...item, entity_type: entityType });
  }

  const hasQuery = query.trim().length > 0;
  const groups = result?.groups ?? [];

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-cream-50 md:hidden">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-cream-300 bg-cream-50/95 px-3 py-2 backdrop-blur-md">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cream-300 bg-white text-cream-900"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, customers, documents…"
            className="h-10 w-full rounded-xl border border-cream-300 bg-white pl-9 pr-3 text-[var(--b-text-body)] text-cream-900 outline-none focus:border-ember-400"
            aria-label="Search seller app"
          />
        </div>
      </header>

      <main className="px-4 py-3">
        {loading ? <p className="px-1 py-2 text-xs text-cream-600">Updating results...</p> : null}
        {error ? <p className="px-1 py-6 text-center text-sm text-danger-700">Could not load search results.</p> : null}

        {!hasQuery && recent.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-500">
              <Clock size={12} />
              Recent
            </div>
            <div className="space-y-2">
              {recent.map((item) => (
                <Link
                  key={item.id}
                  href={item.url_path}
                  className="block rounded-[12px] border border-cream-200 bg-white px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[var(--b-text-body)] font-semibold text-cream-900">{item.label}</p>
                      {item.sublabel ? <p className="mt-0.5 truncate text-[var(--b-text-sub)] text-cream-600">{item.sublabel}</p> : null}
                    </div>
                    <p className="shrink-0 text-[var(--b-text-eyebrow)] font-semibold uppercase tracking-[0.08em] text-cream-500">
                      {ENTITY_LABEL[item.entity_type] ?? item.entity_type}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!hasQuery && recent.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-cream-600">
            Search products, customers, brands, price lists, campaigns, orders, estimates, and invoices.
          </div>
        ) : null}

        {hasQuery && !loading && !error && result?.total === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-cream-600">No results for "{query}".</div>
        ) : null}

        {hasQuery && groups.length > 0 ? (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.entity_type}>
                <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-500">
                  <span>{ENTITY_LABEL[group.entity_type] ?? group.entity_type}</span>
                  <span className="font-mono">{group.items.length}</span>
                </div>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.url_path}
                      onClick={() => remember(item, group.entity_type)}
                      className="block rounded-[12px] border border-cream-200 bg-white px-3.5 py-3"
                    >
                      <p className="truncate text-[var(--b-text-body)] font-semibold text-cream-900">{item.label}</p>
                      {item.sublabel ? <p className="mt-0.5 truncate text-[var(--b-text-sub)] text-cream-600">{item.sublabel}</p> : null}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
