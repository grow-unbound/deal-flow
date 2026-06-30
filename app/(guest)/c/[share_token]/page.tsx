'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Search } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GuestCatalogItem {
  id: string;
  name: string;
  internal_sku: string | null;
  brand: string;
  price: number;
  mrp: number;
  unit: string | null;
  image_url: string | null;
  in_stock: boolean;
}

interface GuestCatalogResponse {
  campaign_id: string;
  name: string;
  products_count: number;
  items: GuestCatalogItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatInr(n: number): string {
  if (n === 0) return '₹0';
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProductCardSkeleton() {
  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: 'var(--border-1)', background: 'var(--bg-surface)' }}
    >
      <div
        className="w-full aspect-square animate-pulse"
        style={{ background: 'var(--bg-recessed)' }}
      />
      <div className="p-3 space-y-2">
        <div
          className="h-3 w-1/2 rounded animate-pulse"
          style={{ background: 'var(--bg-recessed)' }}
        />
        <div
          className="h-4 w-4/5 rounded animate-pulse"
          style={{ background: 'var(--bg-recessed)' }}
        />
        <div
          className="h-4 w-1/3 rounded animate-pulse"
          style={{ background: 'var(--bg-recessed)' }}
        />
        <div
          className="mt-2 h-9 w-full rounded-md animate-pulse"
          style={{ background: 'var(--bg-recessed)' }}
        />
      </div>
    </div>
  );
}

function ProductCard({ item }: { item: GuestCatalogItem }) {
  return (
    <div
      className="rounded-xl overflow-hidden border flex flex-col"
      style={{ borderColor: 'var(--border-1)', background: 'var(--bg-surface)' }}
    >
      {/* Image */}
      <div
        className="w-full aspect-square flex items-center justify-center overflow-hidden"
        style={{ background: 'var(--bg-recessed)' }}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Package className="h-8 w-8" style={{ color: 'var(--fg-4)' }} />
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p
          className="text-xs font-medium mb-0.5 uppercase tracking-wider"
          style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}
        >
          {item.brand}
        </p>
        <p
          className="text-sm font-medium line-clamp-2 flex-1"
          style={{ color: 'var(--fg-1)' }}
        >
          {item.name}
        </p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}
          >
            {formatInr(item.price)}
          </span>
          {item.unit && (
            <span className="text-xs" style={{ color: 'var(--fg-4)' }}>
              / {item.unit}
            </span>
          )}
          {item.mrp > 0 && item.mrp !== item.price && (
            <span
              className="text-xs line-through"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-4)' }}
            >
              {formatInr(item.mrp)}
            </span>
          )}
        </div>

        {/* Guest CTA hint — no add-to-cart */}
        <div
          className="mt-2 h-9 flex items-center justify-center rounded-md text-xs font-medium"
          style={{
            background: item.in_stock ? 'var(--bg-brand-soft)' : 'var(--bg-recessed)',
            color: item.in_stock ? 'var(--teal-500)' : 'var(--fg-4)',
          }}
        >
          {item.in_stock ? 'Login to order' : 'Out of stock'}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuestCatalogPage({
  params,
}: {
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = use(params);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GuestCatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/buyer/catalog/${share_token}`);
        if (cancelled) return;

        if (res.status === 404) {
          setError('not_found');
          return;
        }
        if (!res.ok) {
          setError('server_error');
          return;
        }
        const json = (await res.json()) as GuestCatalogResponse;
        setData(json);
      } catch {
        if (!cancelled) setError('server_error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    // PostHog tracking — non-blocking
    try {
      import('posthog-js').then((mod) => {
        try {
          mod.default.capture('guest_catalog_viewed', { share_token });
        } catch {
          // swallow
        }
      }).catch(() => {});
    } catch {
      // swallow
    }

    return () => {
      cancelled = true;
    };
  }, [share_token]);

  // ── Filtered items ──────────────────────────────────────────────────────────
  const items = data?.items ?? [];
  const filtered = search
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          (item.internal_sku ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : items;

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        {/* Header skeleton */}
        <div className="px-4 pt-6 pb-4">
          <div
            className="h-5 w-32 rounded animate-pulse mb-2"
            style={{ background: 'var(--bg-recessed)' }}
          />
          <div
            className="h-8 w-48 rounded animate-pulse"
            style={{ background: 'var(--bg-recessed)' }}
          />
        </div>
        {/* Search skeleton */}
        <div className="px-4 pb-4">
          <div
            className="h-10 w-full rounded-lg animate-pulse"
            style={{ background: 'var(--bg-recessed)' }}
          />
        </div>
        {/* Grid skeleton */}
        <div className="px-4 pb-28 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </>
    );
  }

  // ── Error / Not found state ─────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p
          className="text-lg font-medium mb-2"
          style={{ color: 'var(--fg-1)' }}
        >
          This catalog link is not active or has expired.
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--fg-3)' }}>
          Please ask your distributor for an updated link.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium underline"
          style={{ color: 'var(--teal-500)' }}
        >
          Go to login
        </Link>
      </div>
    );
  }

  // ── Success state ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}
        >
          Catalog
        </p>
        <h1
          className="text-2xl font-semibold leading-tight"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
        >
          {data.name}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-3)' }}>
          {data.products_count} product{data.products_count !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search bar */}
      <div className="px-4 pb-4">
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--border-2)', background: 'var(--bg-surface)' }}
        >
          <Search
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--fg-4)' }}
          />
          <input
            type="search"
            placeholder="Search products or SKUs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--fg-1)' }}
          />
        </div>
      </div>

      {/* Product grid */}
      <div className="px-4 pb-28">
        {filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>
              No products match your search.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
        <div className="w-full max-w-lg px-4 pb-4 pt-2" style={{ background: 'var(--bg-page)' }}>
          <Link
            href={`/login`}
            className="flex items-center justify-center w-full h-[52px] rounded-xl text-sm font-semibold tracking-wide transition-opacity active:opacity-80"
            style={{
              background: 'var(--teal-500)',
              color: 'var(--cream-50)',
            }}
          >
            Login to place an order →
          </Link>
        </div>
      </div>
    </>
  );
}
