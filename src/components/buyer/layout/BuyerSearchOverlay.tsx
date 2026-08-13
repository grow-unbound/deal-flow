'use client';

import { formatNumberValue } from '@/lib/utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { X, Search, Package, Receipt, FileText, ClipboardList, Tag, LayoutGrid } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { usePointerPrefetch } from '@/hooks/usePointerPrefetch';
import {
  buyerDeliveryStockSignature,
  prefetchBuyerProductDetail,
} from '@/hooks/useBuyerProducts';

interface BuyerSearchItem {
  id: string;
  entity_type: string;
  label: string;
  sublabel: string;
  meta?: string;
}

interface BuyerSearchResponse {
  items: BuyerSearchItem[];
  scope: 'catalog' | 'orders';
}

/** Fire this event to open the search overlay from anywhere in the buyer app. */
export function openBuyerSearch() {
  window.dispatchEvent(new CustomEvent('buyer:openSearch'));
}

type Scope = 'catalog' | 'orders';

const ENTITY_ICON: Record<string, React.ElementType> = {
  product:  Package,
  brand:    Tag,
  category: LayoutGrid,
  order:    Receipt,
  invoice:  FileText,
  estimate: ClipboardList,
};

const ENTITY_LABEL: Record<string, string> = {
  product:  'Product',
  brand:    'Brand',
  category: 'Category',
  order:    'Order',
  invoice:  'Invoice',
  estimate: 'Estimate',
};

const CATALOG_ENTITY_TYPES = new Set(['product', 'brand', 'category']);

export function BuyerSearchOverlay() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefetchOnPress = usePointerPrefetch();
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  const [open, setOpen]       = useState(false);
  const [scope, setScope]     = useState<Scope>('catalog');
  const [query, setQuery]     = useState('');
  const [items, setItems]     = useState<BuyerSearchItem[]>([]);
  const [itemsQuery, setItemsQuery] = useState('');
  const [itemsScope, setItemsScope] = useState<Scope | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);

  const cancelPendingSearch = useCallback(() => {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener('buyer:openSearch', onOpen);
    return () => window.removeEventListener('buyer:openSearch', onOpen);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      cancelPendingSearch();
      setQuery('');
      setItems([]);
      setItemsQuery('');
      setItemsScope(null);
      setHasLoaded(false);
      setLoading(false);
    }
  }, [cancelPendingSearch, open]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    cancelPendingSearch();
  }, [cancelPendingSearch]);

  // Esc to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const search = useCallback(async (q: string, sc: Scope) => {
    const trimmedQuery = q.trim();
    if (!trimmedQuery) return;

    const controller = new AbortController();
    const requestSequence = ++requestSequenceRef.current;
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/buyer/search?q=${encodeURIComponent(trimmedQuery)}&scope=${sc}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json() as BuyerSearchResponse;
        if (requestSequence !== requestSequenceRef.current) return;
        setItems(data.items ?? []);
        setItemsQuery(trimmedQuery);
        setItemsScope(sc);
        setHasLoaded(true);
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

  const handleChange = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    cancelPendingSearch();
    if (!q.trim()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(q, scope), 280);
  }, [cancelPendingSearch, scope, search]);

  const handleScopeChange = useCallback((sc: Scope) => {
    setScope(sc);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    cancelPendingSearch();
    if (query.trim()) {
      setLoading(true);
      debounceRef.current = setTimeout(() => search(query, sc), 0);
    } else {
      setLoading(false);
    }
  }, [cancelPendingSearch, query, search]);

  const navigate = useCallback((item: BuyerSearchItem) => {
    setOpen(false);
    if (item.entity_type === 'product') {
      router.push(`/buy/product/${item.id}`);
    } else if (item.entity_type === 'brand') {
      router.push(`/buy/catalog/brand/${item.id}`);
    } else if (item.entity_type === 'category') {
      router.push(`/buy/catalog/category/${item.id}`);
    } else if (item.entity_type === 'order') {
      router.push(`/buy/orders?tab=orders`);
    } else if (item.entity_type === 'estimate') {
      router.push(`/buy/orders?tab=enquiries`);
    } else if (item.entity_type === 'invoice') {
      router.push(`/buy/orders?tab=invoices`);
    }
  }, [router]);

  const displayedItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [];
    if (itemsScope === scope && itemsQuery.toLocaleLowerCase() === normalizedQuery) return items;

    return items.filter((item) => {
      const belongsToScope = scope === 'catalog'
        ? CATALOG_ENTITY_TYPES.has(item.entity_type)
        : !CATALOG_ENTITY_TYPES.has(item.entity_type);
      const searchableText = `${item.label} ${item.sublabel} ${item.meta ?? ''}`.toLocaleLowerCase();
      return belongsToScope && searchableText.includes(normalizedQuery);
    });
  }, [items, itemsQuery, itemsScope, query, scope]);
  const hasAuthoritativeResult = itemsScope === scope
    && itemsQuery.toLocaleLowerCase() === query.trim().toLocaleLowerCase();

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        backdropFilter: 'blur(2px)',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: 'var(--bg-base)',
          maxHeight: '90dvh',
          display: 'flex', flexDirection: 'column',
          borderRadius: '0 0 20px 20px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px', borderBottom: '1px solid var(--border-1)' }}>
          <Search size={18} style={{ color: 'var(--cream-500)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={scope === 'catalog' ? 'Search products, SKU…' : 'Search orders, estimates, invoices…'}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 'var(--b-text-body)', color: 'var(--cream-900)',
            }}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border-1)', background: 'var(--cream-100)', flexShrink: 0, cursor: 'pointer' }}
            aria-label="Close search"
          >
            <X size={14} style={{ color: 'var(--cream-600)' }} />
          </button>
        </div>

        {/* Scope tabs */}
        <div style={{ display: 'flex', padding: '0 16px', gap: 4, borderBottom: '1px solid var(--border-1)' }}>
          {(['catalog', 'orders'] as Scope[]).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => handleScopeChange(sc)}
              style={{
                padding: '8px 14px',
                marginBottom: -1,
                border: 'none',
                borderBottom: scope === sc ? '2px solid var(--teal-500)' : '2px solid transparent',
                background: 'none',
                cursor: 'pointer',
                fontSize: 'var(--b-text-sub)',
                fontWeight: scope === sc ? 600 : 400,
                color: scope === sc ? 'var(--teal-500)' : 'var(--cream-600)',
              }}
            >
              {sc === 'catalog' ? 'Catalog' : 'Orders & Docs'}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0 12px' }}>
          {loading && !hasLoaded && (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: 44, borderRadius: 10, background: 'var(--cream-100)', animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          )}

          {loading && hasLoaded && (
            <div style={{ padding: '6px 16px 2px', color: 'var(--cream-500)', fontSize: 'var(--b-text-eyebrow)' }}>
              Updating results…
            </div>
          )}

          {!loading && query.trim() && hasAuthoritativeResult && items.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--cream-500)', fontSize: 'var(--b-text-sub)' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && !query.trim() && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--cream-400)', fontSize: 'var(--b-text-sub)' }}>
              {scope === 'catalog' ? 'Search products and brands' : 'Search your orders, enquiries and invoices'}
            </div>
          )}

          {displayedItems.map((item) => {
            const Icon = ENTITY_ICON[item.entity_type] ?? Search;
            const productHref = item.entity_type === 'product' ? `/buy/product/${item.id}` : null;
            const prefetchProduct = productHref
              ? prefetchOnPress(productHref, () => {
                  prefetchBuyerProductDetail(queryClient, item.id, stockSignature);
                })
              : undefined;
            return (
              <button
                key={`${item.entity_type}-${item.id}`}
                type="button"
                onClick={() => navigate(item)}
                onPointerDown={prefetchProduct}
                onTouchStart={prefetchProduct}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--cream-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} style={{ color: 'var(--cream-600)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--b-text-body)', fontWeight: 500, color: 'var(--cream-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </div>
                  {item.sublabel && (
                    <div style={{ fontSize: 'var(--b-text-eyebrow)', color: 'var(--cream-500)', textTransform: 'capitalize' }}>
                      {item.sublabel}
                    </div>
                  )}
                </div>
                {item.meta && (
                  <span style={{ fontSize: 'var(--b-text-sub)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-700)', flexShrink: 0 }}>
                    {formatNumberValue(Number(item.meta), 'CURRENCY_EXACT')}
                  </span>
                )}
                <span style={{ fontSize: 'var(--b-text-eyebrow)', color: 'var(--cream-400)', background: 'var(--cream-100)', padding: '2px 8px', borderRadius: 100, flexShrink: 0 }}>
                  {ENTITY_LABEL[item.entity_type] ?? item.entity_type}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
