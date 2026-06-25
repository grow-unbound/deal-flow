'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Heart, Minus, Package, Plus, ShoppingCart } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { formatCurrency, cn } from '@/lib/utils';
import { markBuyerNavigationBack, markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { useCart } from '@/contexts/BuyerCartContext';
import { StockBadge } from '@/components/buyer/catalog/StockBadge';
import { buildBuyerSearchHref } from '@/lib/buyer-routes';
import type { BuyerCatalogItem } from '@/types/buyer';

interface BuyerProductDetailClientProps {
  tenantProductId: string;
}

export function BuyerProductDetailClient({ tenantProductId }: BuyerProductDetailClientProps): React.ReactNode {
  const router = useRouter();
  const { addItem, items: cartItems } = useCart();
  const [item, setItem] = React.useState<BuyerCatalogItem | null>(null);
  const [brandItems, setBrandItems] = React.useState<BuyerCatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);
  const [qty, setQty] = React.useState(1);
  const [wishlisted, setWishlisted] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiFetch(`/api/buyer/catalog?tenant_product_id=${encodeURIComponent(tenantProductId)}&limit=1&offset=0`)
      .then((r) => r.json() as Promise<{ items?: BuyerCatalogItem[] }>)
      .then((data) => {
        if (cancelled) return;
        const first = data.items?.[0] ?? null;
        setItem(first);
        if (!first) {
          setError(true);
          return;
        }
        if (first.brand_id) {
          return apiFetch(`/api/buyer/catalog?brand_id=${encodeURIComponent(first.brand_id)}&limit=8&offset=0`)
            .then((r) => r.json() as Promise<{ items?: BuyerCatalogItem[] }>)
            .then((bd) => {
              if (!cancelled) {
                setBrandItems((bd.items ?? []).filter((i) => i.tenant_product_id !== tenantProductId).slice(0, 6));
              }
            });
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantProductId]);

  const cartLine = item ? cartItems.find((i) => i.tenant_product_id === item.tenant_product_id) : undefined;

  function handleBack(): void {
    markBuyerNavigationBack();
    router.back();
  }

  function handleAddToCart(): void {
    if (!item) return;
    const q = Math.max(1, qty);
    addItem({
      tenant_product_id: item.tenant_product_id,
      name: item.display_name,
      brand: item.brand_name ?? undefined,
      internal_sku: item.internal_sku,
      image_url: item.image_urls[0],
      unit_price: item.price,
      unit: item.default_uom ?? undefined,
      quantity: q,
      line_total: item.price * q,
    });
    setQty(1);
  }

  const firstImage = !imgError && item && item.image_urls.length > 0 ? item.image_urls[0] : null;
  const searchHref = item
    ? buildBuyerSearchHref({
        q: item.display_name,
        category_id: item.category_id ?? undefined,
        brand_id: item.brand_id ?? undefined,
      })
    : '/buy/search';

  const savePct =
    item && item.mrp > 0 && item.mrp > item.price
      ? Math.round(((item.mrp - item.price) / item.mrp) * 100)
      : 0;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 py-12 text-sm" style={{ color: 'var(--fg-3)' }}>
        Loading product…
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex flex-col gap-4 px-4 py-8">
        <p className="text-sm" style={{ color: 'var(--fg-2)' }}>Product not found or unavailable.</p>
        <button
          type="button"
          onClick={handleBack}
          className="w-fit rounded-full border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border-1)', color: 'var(--fg-2)' }}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col pb-28" style={{ background: 'var(--bg-base)' }}>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2"
        style={{
          background: 'rgba(253,251,247,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[var(--fg-2)]"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          Product
        </span>
        <Link
          href={searchHref}
          onClick={() => markBuyerNavigationForward()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface)', color: 'var(--fg-2)' }}
          aria-label="Search"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </Link>
      </header>

      {/* Hero image — 1.45:1 aspect ratio */}
      <div className="relative w-full" style={{ paddingTop: '69%', background: 'var(--bg-recessed)' }}>
        {firstImage ? (
          <Image
            src={firstImage}
            alt={item.display_name}
            fill
            className="object-contain p-6"
            sizes="100vw"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="h-16 w-16" style={{ color: 'var(--fg-3)' }} />
          </div>
        )}
        {/* Heart wishlist button */}
        <button
          type="button"
          onClick={() => setWishlisted((v) => !v)}
          className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-full"
          style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart
            className="w-4 h-4"
            style={{ color: wishlisted ? '#dc2626' : 'var(--cream-500)', fill: wishlisted ? '#dc2626' : 'none' }}
          />
        </button>
      </div>

      {/* Product info */}
      <div className="space-y-4 px-4 py-4">
        {item.brand_name && (
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>
            {item.brand_name}
          </p>
        )}
        <h1 className="text-xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          {item.display_name}
        </h1>
        {item.internal_sku && (
          <p className="text-xs" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
            {item.internal_sku}
          </p>
        )}

        {/* Price row */}
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}>
            {formatCurrency(item.price)}
          </span>
          {item.mrp > 0 && item.mrp > item.price && (
            <span className="text-sm line-through" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>
              {formatCurrency(item.mrp)}
            </span>
          )}
          {savePct > 0 && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: '#F5E1D3', color: '#874720' }}
            >
              Save {savePct}%
            </span>
          )}
        </div>

        <StockBadge status={item.stock_status} />

        {/* Attributes 2×2 mini grid */}
        <div className="grid grid-cols-2 gap-2">
          <AttrCard label="Pack size" value={item.pack_size ? `${item.pack_size} units` : '—'} />
          <AttrCard label="Min order" value={item.default_uom ? `1 ${item.default_uom}` : '1 unit'} />
          <AttrCard
            label="In stock"
            value={item.stock_status === 'out_of_stock' ? 'Out of stock' : item.stock_status === 'limited' ? 'Limited' : 'Available'}
          />
          <AttrCard label="Delivery" value="2–3 working days" />
        </div>

        {/* Spec list */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-1)' }}>
          {item.category_name && <SpecRow label="Category" value={item.category_name} />}
          {item.default_uom && <SpecRow label="Unit" value={item.default_uom} />}
          {item.pack_size && <SpecRow label="Pack size" value={String(item.pack_size)} />}
          <SpecRow label="SKU" value={item.internal_sku} mono />
          {item.catalog_name && <SpecRow label="Catalog" value={item.catalog_name} />}
        </div>
      </div>

      {/* More from brand carousel */}
      {brandItems.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--cream-500)' }}>
            More from {item.brand_name ?? 'brand'}
          </h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
            {brandItems.map((b) => (
              <Link
                key={b.tenant_product_id}
                href={`/buy/product/${b.tenant_product_id}`}
                onClick={() => markBuyerNavigationForward()}
                className="shrink-0 rounded-xl no-underline"
                style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)', width: 120 }}
              >
                <div
                  className="rounded-t-xl overflow-hidden relative"
                  style={{ paddingTop: '72%', background: 'var(--cream-100)' }}
                >
                  {b.image_urls[0] ? (
                    <Image
                      src={b.image_urls[0]}
                      alt={b.display_name}
                      fill
                      className="object-contain p-2"
                      sizes="120px"
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Package className="w-6 h-6" style={{ color: 'var(--cream-400)' }} />
                    </div>
                  )}
                </div>
                <div className="px-2 py-2">
                  <p className="text-xs font-medium leading-tight line-clamp-2" style={{ color: 'var(--fg-1)' }}>
                    {b.display_name}
                  </p>
                  <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}>
                    {formatCurrency(b.price)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sticky footer — qty stepper + Add to cart */}
      <div
        className="fixed bottom-0 left-1/2 z-20 w-full px-4 py-3"
        style={{
          transform: 'translateX(-50%)',
          maxWidth: 468,
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom,0px))',
          background: 'rgba(253,251,247,0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface)' }}
          >
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center"
              style={{ color: 'var(--fg-2)' }}
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span
              className="min-w-[2rem] text-center text-sm font-semibold"
              style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}
            >
              {qty}
            </span>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center"
              style={{ color: 'var(--fg-2)' }}
              aria-label="Increase quantity"
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={item.stock_status === 'out_of_stock'}
            onClick={handleAddToCart}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl font-semibold text-white text-sm',
              item.stock_status === 'out_of_stock' ? 'cursor-not-allowed opacity-50' : '',
            )}
            style={{ background: item.stock_status === 'out_of_stock' ? 'var(--fg-3)' : 'var(--teal-500)' }}
          >
            <ShoppingCart className="h-4 w-4" aria-hidden />
            Add · {formatCurrency(item.price * qty)}
          </button>
          {cartLine && (
            <Link
              href="/buy/cart"
              onClick={() => markBuyerNavigationForward()}
              className="rounded-xl px-3 py-2 text-xs font-semibold no-underline"
              style={{ border: '1px solid var(--border-1)', color: 'var(--fg-2)' }}
            >
              In cart ({cartLine.quantity})
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function AttrCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-3"
      style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}
    >
      <p className="text-xs mb-0.5" style={{ color: 'var(--fg-3)' }}>
        {label}
      </p>
      <p className="text-sm font-semibold" style={{ color: 'var(--fg-1)' }}>
        {value}
      </p>
    </div>
  );
}

function SpecRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: '1px solid var(--border-1)' }}
    >
      <span className="text-sm" style={{ color: 'var(--fg-3)' }}>
        {label}
      </span>
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--fg-1)', fontFamily: mono ? 'var(--font-mono)' : undefined }}
      >
        {value}
      </span>
    </div>
  );
}
