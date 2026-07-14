'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  FileText,
  FolderTree,
  ListOrdered,
  MapPin,
  Megaphone,
  Package,
  Receipt,
  Search,
  Tag,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';

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

const ENTITY_ICON: Record<string, React.ElementType> = {
  product: Package,
  brand: Tag,
  customer: Users,
  category: FolderTree,
  location: MapPin,
  warehouse: Warehouse,
  cohort: Users,
  campaign: Megaphone,
  price_list: ListOrdered,
  order: Receipt,
  invoice: FileText,
  estimate: FileText,
};

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

const ENTITY_LIST_URL: Record<string, string> = {
  product: '/products',
  brand: '/brands',
  customer: '/customers',
  category: '/categories',
  location: '/locations',
  warehouse: '/warehouses',
  cohort: '/customer-groups',
  campaign: '/campaigns',
  price_list: '/price-lists',
  order: '/sales-orders',
  invoice: '/invoices',
  estimate: '/estimates',
};

const RECENT_KEY = 'seller-search-recent';
const MAX_RECENT = 5;

interface RecentItem extends SearchItem {
  entity_type: string;
}

function loadRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentItem[];
  } catch {
    return [];
  }
}

function saveRecent(item: RecentItem) {
  const existing = loadRecent().filter((r) => r.id !== item.id);
  localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...existing].slice(0, MAX_RECENT)));
}

interface Props {
  className?: string;
}

export function GlobalSearchOverlay({ className }: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GlobalSearchResponse | null>(null);
  const [resultQuery, setResultQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  const cancelPendingSearch = useCallback(() => {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (open) setRecent(loadRecent());
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      cancelPendingSearch();
      setQuery('');
      setResult(null);
      setResultQuery('');
      setLoading(false);
    }
  }, [cancelPendingSearch, open]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    cancelPendingSearch();
  }, [cancelPendingSearch]);

  useEffect(() => {
    function onDocumentPointerDown(event: PointerEvent) {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }

    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const search = useCallback(async (q: string) => {
    const trimmedQuery = q.trim();
    if (!trimmedQuery) return;

    const controller = new AbortController();
    const requestSequence = ++requestSequenceRef.current;
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tenant/search?q=${encodeURIComponent(trimmedQuery)}&limit=5`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json() as GlobalSearchResponse;
        if (requestSequence !== requestSequenceRef.current) return;
        setResult(data);
        setResultQuery(trimmedQuery);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) return;
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  const handleQuery = useCallback((q: string) => {
    setQuery(q);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    cancelPendingSearch();
    if (!q.trim()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(q), 200);
  }, [cancelPendingSearch, search]);

  const navigate = useCallback((item: SearchItem, entityType: string) => {
    const full: RecentItem = { ...item, entity_type: entityType };
    saveRecent(full);
    setOpen(false);
    router.push(item.url_path);
  }, [router]);

  const showRecent = open && !query.trim() && recent.length > 0;
  const showResults = open && !!query.trim();
  const displayedResult = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!result || !normalizedQuery) return null;
    if (resultQuery.toLocaleLowerCase() === normalizedQuery) return result;

    const groups = result.groups.flatMap((group) => {
      const items = group.items.filter((item) => (
        `${item.label} ${item.sublabel ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
      ));
      return items.length > 0 ? [{ ...group, items }] : [];
    });

    return {
      groups,
      total: groups.reduce((total, group) => total + group.items.length, 0),
    };
  }, [query, result, resultQuery]);
  const hasAuthoritativeResult = resultQuery.toLocaleLowerCase() === query.trim().toLocaleLowerCase();
  const noResults = showResults && !loading && hasAuthoritativeResult && (result?.total ?? 0) === 0;

  return (
    <div ref={rootRef} className={cn('relative w-full min-w-0', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500"
          strokeWidth={2}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search seller entities"
          placeholder="Search products, customers, campaigns, price lists…"
          value={query}
          onChange={(event) => handleQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          className={cn(
            'h-11 w-full rounded-[12px] border border-cream-300 bg-[var(--bg-surface)] pl-10 pr-24',
            'text-[14px] font-medium tracking-[-0.01em] text-[#221E1A] placeholder:text-cream-500',
            'transition-colors duration-fast outline-none hover:border-cream-400 focus:border-cream-400 focus:bg-white focus:ring-2 focus:ring-ember-400/20',
          )}
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-cream-300 bg-cream-100 px-2 py-0.5 text-[11px] font-medium text-cream-500 sm:inline-flex">
          ⌘K
        </kbd>
        {query ? (
          <button
            type="button"
            onClick={() => handleQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-cream-500 transition-colors hover:text-[#221E1A]"
            aria-label="Clear search"
          >
            <X size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-[16px] border border-cream-300 bg-cream-50 shadow-xl">
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loading && result === null ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-[12px] px-3 py-2">
                    <div className="h-4 w-4 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-24 animate-pulse rounded bg-cream-100" />
                  </div>
                ))}
              </div>
            ) : null}

            {loading && result !== null ? (
              <div className="px-3 py-1 text-xs text-cream-500">Updating results…</div>
            ) : null}

            {noResults ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-cream-500">
                <Search size={28} strokeWidth={1.5} />
                <span className="text-sm">No results for “{query}”</span>
              </div>
            ) : null}

            {showRecent ? (
              <section className="px-1 pb-1">
                <div className="flex items-center gap-1.5 px-2 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">
                  <Clock size={12} />
                  Recent
                </div>
                <div className="space-y-1">
                  {recent.map((item) => {
                    const Icon = ENTITY_ICON[item.entity_type] ?? Search;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item, item.entity_type)}
                        className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-[rgba(34,30,26,0.04)]"
                      >
                        <Icon size={15} className="shrink-0 text-cream-500" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#221E1A]">{item.label}</span>
                        {item.sublabel ? <span className="shrink-0 truncate text-xs text-cream-500">{item.sublabel}</span> : null}
                        <span className="shrink-0 rounded-full bg-cream-100 px-2 py-0.5 text-[10px] text-cream-500">
                          {ENTITY_LABEL[item.entity_type] ?? item.entity_type}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {showResults && displayedResult?.groups.length ? (
              <div className="space-y-2">
                {displayedResult.groups.map((group) => {
                  const Icon = ENTITY_ICON[group.entity_type] ?? Search;
                  const label = ENTITY_LABEL[group.entity_type] ?? group.entity_type;
                  return (
                    <section key={group.entity_type} className="px-1 pb-1">
                      <div className="flex items-center justify-between px-2 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">
                        <span className="flex items-center gap-1.5">
                          <Icon size={12} />
                          {label}
                        </span>
                        <span className="font-mono tabular-nums text-cream-400">
                          {group.items.length}
                          {group.items.length === 5 ? '+' : ''}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigate(item, group.entity_type)}
                            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-[rgba(34,30,26,0.04)]"
                          >
                            <Icon size={15} className="shrink-0 text-cream-500" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#221E1A]">{item.label}</span>
                            {item.sublabel ? <span className="max-w-[160px] shrink-0 truncate text-xs text-cream-500">{item.sublabel}</span> : null}
                          </button>
                        ))}

                        {group.items.length === 5 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              const base = ENTITY_LIST_URL[group.entity_type] ?? `/${group.entity_type}s`;
                              router.push(`${base}?search=${encodeURIComponent(query)}`);
                            }}
                            className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-teal-600 transition-colors hover:bg-[rgba(34,30,26,0.04)]"
                          >
                            <span className="text-sm">See all {label.toLowerCase()} →</span>
                          </button>
                        ) : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}

            {open && !loading && !showRecent && !showResults && !noResults ? (
              <div className="px-4 py-4 text-sm text-cream-500">
                Start typing to search products, brands, customers, categories, locations, warehouses, customer groups, campaigns, price lists, and documents.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
