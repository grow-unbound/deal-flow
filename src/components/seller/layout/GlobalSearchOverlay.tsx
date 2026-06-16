'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Package,
  Tag,
  Users,
  FileText,
  Receipt,
  ClipboardList,
  Clock,
  Search,
} from 'lucide-react';
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

const ENTITY_ICON: Record<string, React.ElementType> = {
  product:  Package,
  brand:    Tag,
  customer: Users,
  order:    Receipt,
  invoice:  FileText,
  estimate: ClipboardList,
};

const ENTITY_LABEL: Record<string, string> = {
  product:  'Products',
  brand:    'Brands',
  customer: 'Customers',
  order:    'Orders',
  invoice:  'Invoices',
  estimate: 'Estimates',
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchOverlay({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery]       = useState('');
  const [result, setResult]     = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading]   = useState(false);
  const [recent, setRecent]     = useState<RecentItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent on open
  useEffect(() => {
    if (open) setRecent(loadRecent());
  }, [open]);

  // Reset query on close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResult(null);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tenant/search?q=${encodeURIComponent(q)}&limit=5`);
      if (res.ok) {
        const data = await res.json() as GlobalSearchResponse;
        setResult(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQuery = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 200);
  }, [search]);

  const navigate = useCallback((item: SearchItem, entity_type: string) => {
    const full: RecentItem = { ...item, entity_type };
    saveRecent(full);
    onOpenChange(false);
    router.push(item.url_path);
  }, [router, onOpenChange]);

  const showRecent  = !query.trim() && recent.length > 0;
  const showResults = !!query.trim();
  const noResults   = showResults && !loading && result?.total === 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search brands, products, customers, orders…"
        value={query}
        onValueChange={handleQuery}
      />
      <CommandList>
        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-md px-2 py-2">
                <div className="h-4 w-4 animate-pulse rounded bg-cream-200" />
                <div className="h-3 flex-1 animate-pulse rounded bg-cream-200" />
                <div className="h-3 w-24 animate-pulse rounded bg-cream-100" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {noResults && (
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-6 text-center text-cream-500">
              <Search size={28} strokeWidth={1.5} />
              <span className="text-sm">No results for &ldquo;{query}&rdquo;</span>
            </div>
          </CommandEmpty>
        )}

        {/* Recent */}
        {showRecent && !loading && (
          <CommandGroup heading={
            <span className="flex items-center gap-1.5 text-xs text-cream-500">
              <Clock size={12} /> Recent
            </span>
          }>
            {recent.map((item) => {
              const Icon = ENTITY_ICON[item.entity_type] ?? Search;
              return (
                <CommandItem
                  key={item.id}
                  value={`${item.entity_type}-${item.id}`}
                  onSelect={() => navigate(item, item.entity_type)}
                  className="flex items-center gap-3"
                >
                  <Icon size={15} className="shrink-0 text-cream-500" />
                  <span className="flex-1 truncate text-sm font-medium text-cream-900">{item.label}</span>
                  {item.sublabel && (
                    <span className="shrink-0 truncate text-xs text-cream-500">{item.sublabel}</span>
                  )}
                  <span className="ml-1 shrink-0 rounded-full bg-cream-100 px-1.5 py-0.5 text-[10px] text-cream-500">
                    {ENTITY_LABEL[item.entity_type] ?? item.entity_type}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search results */}
        {showResults && !loading && result && result.groups.length > 0 && result.groups.map((group, gi) => {
          const Icon = ENTITY_ICON[group.entity_type] ?? Search;
          const groupLabel = ENTITY_LABEL[group.entity_type] ?? group.entity_type;
          return (
            <React.Fragment key={group.entity_type}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Icon size={12} />
                    {groupLabel}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-cream-400">
                    {group.items.length}
                    {group.items.length === 5 ? '+' : ''}
                  </span>
                </span>
              }>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${group.entity_type}-${item.id}`}
                    onSelect={() => navigate(item, group.entity_type)}
                    className="flex items-center gap-3"
                  >
                    <Icon size={15} className="shrink-0 text-cream-500" />
                    <span className="flex-1 truncate text-sm font-medium text-cream-900">{item.label}</span>
                    {item.sublabel && (
                      <span className="max-w-[160px] shrink-0 truncate text-xs text-cream-500">{item.sublabel}</span>
                    )}
                  </CommandItem>
                ))}

                {/* See all → navigates to list page with search pre-filled */}
                {group.items.length === 5 && (
                  <CommandItem
                    value={`see-all-${group.entity_type}`}
                    onSelect={() => {
                      onOpenChange(false);
                      const listUrls: Record<string, string> = {
                        product:  '/products',
                        brand:    '/brands',
                        customer: '/customers',
                        order:    '/sales-orders',
                        invoice:  '/invoices',
                        estimate: '/estimates',
                      };
                      const base = listUrls[group.entity_type] ?? `/${group.entity_type}s`;
                      router.push(`${base}?search=${encodeURIComponent(query)}`);
                    }}
                    className="flex items-center gap-2 text-teal-600"
                  >
                    <span className="text-sm">See all {groupLabel.toLowerCase()} →</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </React.Fragment>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
