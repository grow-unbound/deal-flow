'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Minus, Plus, Package, ChevronLeft, MapPin, ChevronRight, Check } from 'lucide-react';
import { useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';

interface NearestLocationResponse {
  location_id: string | null;
  name: string | null;
  distance_km: number | null;
  fallback: boolean;
}

type CartLineItem = {
  tenant_product_id: string;
  qty: number;
  unit_price: number;
  product_name?: string;
};

type OrderPlaceResponse = {
  success: boolean;
  order_id?: string;
  order_number?: string | null;
  error?: string;
};

type EstimateResponse = {
  success: boolean;
  estimate_id?: string;
  estimate_number?: string | null;
  error?: string;
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const BACK_BTN: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(255,255,255,0.85)', border: '1px solid var(--cream-300)', color: 'var(--cream-800)',
};

const STICKY_HEADER: React.CSSProperties = {
  height: 'var(--header-h, 56px)',
  background: 'rgba(250, 247, 242, 0.92)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  borderBottom: '1px solid rgba(212, 204, 192, 0.6)',
};

export default function CartPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, removeItem, updateQty, clearCart } = useCart();
  const delivery = useBuyerDeliveryOptional();
  const [placingOrder, setPlacingOrder] = useState(false);
  const [requestingQuote, setRequestingQuote] = useState(false);
  const [error, setError] = useState('');

  const gstAmount = Math.round(subtotal * 0.18);
  const deliveryFee = 0;
  const total = subtotal + gstAmount + deliveryFee;
  const isBusy = placingOrder || requestingQuote;

  function buildLineItems(): CartLineItem[] {
    return items.map((i) => ({
      tenant_product_id: i.tenant_product_id,
      qty: i.quantity,
      unit_price: i.unit_price,
      product_name: i.name,
    }));
  }

  async function resolveNearestLocation(): Promise<{ location_id: string | null; delivery_address: object | null }> {
    const loc = delivery?.selected;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      return { location_id: null, delivery_address: null };
    }
    try {
      const res = await apiFetch(`/api/buyer/nearest-location?lat=${loc.lat}&lng=${loc.lng}`);
      const data: NearestLocationResponse = await res.json();
      return {
        location_id: data.location_id,
        delivery_address: {
          label: loc.label,
          formatted_address: loc.formatted_address,
          city: loc.city,
          state: loc.state,
          pincode: loc.pincode,
          lat: loc.lat,
          lng: loc.lng,
        },
      };
    } catch {
      return { location_id: null, delivery_address: null };
    }
  }

  async function handlePlaceOrder() {
    if (isBusy || items.length === 0) return;
    setError('');
    setPlacingOrder(true);
    try {
      const { location_id, delivery_address } = await resolveNearestLocation();
      const raw = await apiFetch('/api/buyer/orders', {
        method: 'POST',
        body: JSON.stringify({ items: buildLineItems(), location_id, delivery_address }),
      });
      const res: OrderPlaceResponse = await raw.json();
      if (!raw.ok || !res.success) {
        setError(res.error ?? 'Could not place order. Please try again.');
        return;
      }
      clearCart();
      const params = new URLSearchParams({
        order_id: res.order_id ?? '',
        order_number: res.order_number ?? '',
        total: String(total),
      });
      router.replace(`/buy/order-placed?${params.toString()}`);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleRequestQuote() {
    if (isBusy || items.length === 0) return;
    setError('');
    setRequestingQuote(true);
    try {
      const { location_id, delivery_address } = await resolveNearestLocation();
      const raw = await apiFetch('/api/buyer/estimates', {
        method: 'POST',
        body: JSON.stringify({ items: buildLineItems(), location_id, delivery_address }),
      });
      const res: EstimateResponse = await raw.json();
      if (!raw.ok || !res.success) {
        setError(res.error ?? 'Could not request quote. Please try again.');
        return;
      }
      clearCart();
      const params = new URLSearchParams({ tab: 'enquiries' });
      if (res.estimate_number) {
        params.set('highlight', res.estimate_number);
      }
      router.replace(`/buy/orders?${params.toString()}`);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setRequestingQuote(false);
    }
  }

  if (items.length === 0) {
    return (
      <>
        <header className="sticky top-0 z-20 flex items-center px-4" style={STICKY_HEADER}>
          <button onClick={() => router.back()} className="flex items-center justify-center shrink-0" style={BACK_BTN} aria-label="Go back">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="flex-1 text-center font-semibold" style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}>
            Cart
          </h1>
          <div style={{ width: 36 }} />
        </header>

        <div className="flex flex-col items-center justify-center px-6 py-24 gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'var(--cream-100)' }}>
            <ShoppingCart className="w-8 h-8" style={{ color: 'var(--cream-400)' }} />
          </div>
          <div>
            <h2 className="font-semibold mb-1" style={{ fontSize: 'var(--b-text-section)', fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--fg-1, var(--cream-900))' }}>
              Your cart is empty
            </h2>
            <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--fg-3, var(--cream-600))' }}>
              Add products from the catalog to get started.
            </p>
          </div>
          <button
            onClick={() => router.push('/buy/catalog')}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-white"
            style={{ fontSize: 'var(--b-text-label)', background: 'var(--teal-500)', borderRadius: 10 }}
          >
            Browse Catalog
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center px-4" style={STICKY_HEADER}>
        <button onClick={() => router.back()} className="flex items-center justify-center shrink-0" style={BACK_BTN} aria-label="Go back">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="flex-1 text-center font-semibold" style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}>
          Cart
        </h1>
        <button
          onClick={() => clearCart()}
          className="font-medium"
          style={{ fontSize: 'var(--b-text-label)', color: 'var(--danger-500)' }}
        >
          Clear
        </button>
      </header>

      {/* Scrollable content */}
      <div className="px-4 pt-4 space-y-3" style={{ paddingBottom: '7rem' }}>
        {/* Inline page head */}
        <div className="pb-1">
          <p className="font-semibold uppercase mb-0.5" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>
            {items.length} {items.length === 1 ? 'Product' : 'Products'} · {itemCount} {itemCount === 1 ? 'unit' : 'units'}
          </p>
          <h2 className="font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-section)', fontWeight: 500, letterSpacing: '-0.005em', color: 'var(--fg-1, var(--cream-900))' }}>
            Review &amp; place
          </h2>
        </div>

        {/* All items in one card, separated by dividers */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}>
          {items.map((item, idx) => (
            <CartPageItem
              key={item.tenant_product_id}
              item={item}
              onQtyChange={updateQty}
              onRemove={removeItem}
              showDivider={idx > 0}
            />
          ))}
        </div>

        {/* Totals card */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}>
          <div className="px-4 py-3.5 space-y-2.5">
            <TotalsRow label="Subtotal" value={formatCurrency(subtotal)} />
            <TotalsRow label="GST · 18%" value={formatCurrency(gstAmount)} />
            <TotalsRow label="Delivery" value={deliveryFee === 0 ? 'Included' : formatCurrency(deliveryFee)} isText />
          </div>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-1)' }}>
            <span style={{ fontSize: 'var(--b-text-label)', fontWeight: 600, color: 'var(--fg-1, var(--cream-900))' }}>
              Total
            </span>
            <span style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg-1, var(--cream-900))' }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* Delivery row */}
        <button
          onClick={() => router.push('/buy/location')}
          className="w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left"
          style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}
        >
          <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ember-50)' }}>
            <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--ember-400)' }} />
          </div>
          <div className="flex-1 min-w-0">
            {delivery?.selected ? (
              <>
                <p className="uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>Deliver to</p>
                <p className="font-semibold truncate" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1, var(--cream-900))' }}>
                  {delivery.selected.label}
                </p>
                <p className="truncate" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3, var(--cream-600))' }}>
                  {[delivery.selected.city, delivery.selected.pincode].filter(Boolean).join(' · ')}{' · 2–3 days'}
                </p>
              </>
            ) : (
              <>
                <p className="uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>Deliver to</p>
                <p className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1, var(--cream-900))' }}>
                  Set delivery location
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-medium" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--teal-500)' }}>Change</span>
            <ChevronRight className="w-3 h-3" style={{ color: 'var(--teal-500)' }} />
          </div>
        </button>

        {/* Error */}
        {error && (
          <div className="rounded-xl px-4 py-3" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 'var(--b-text-label)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div
        className="fixed bottom-0 left-1/2 z-20 w-full px-4 pt-2.5"
        style={{
          transform: 'translateX(-50%)',
          maxWidth: BUYER_PREVIEW_MAX_WIDTH,
          paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(250, 247, 242, 0.94)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        <div className="flex gap-2">
          <button
            onClick={handleRequestQuote}
            disabled={isBusy}
            className="flex h-12 flex-1 items-center justify-center gap-1.5 font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ fontSize: 'var(--b-text-label)', background: 'var(--teal-500)', borderRadius: 10 }}
          >
            <WhatsAppIcon className="w-4 h-4 shrink-0" />
            {requestingQuote ? 'Requesting…' : 'Get WhatsApp quote'}
          </button>
          <button
            onClick={handlePlaceOrder}
            disabled={isBusy}
            className="flex h-12 flex-1 items-center justify-center gap-1.5 font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ fontSize: 'var(--b-text-label)', background: 'var(--ember-400)', borderRadius: 10 }}
          >
            <Check className="w-4 h-4 shrink-0" />
            {placingOrder ? 'Placing…' : 'Place order'}
          </button>
        </div>
      </div>
    </>
  );
}

function TotalsRow({ label, value, isText }: { label: string; value: string; isText?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-3, var(--cream-700))' }}>{label}</span>
      <span style={{ fontSize: 'var(--b-text-label)', fontWeight: 500, color: 'var(--fg-1, var(--cream-900))', fontFamily: isText ? undefined : 'var(--font-mono)' }}>
        {value}
      </span>
    </div>
  );
}

function CartPageItem({
  item,
  onQtyChange,
  onRemove,
  showDivider,
}: {
  item: BuyerCartItem;
  onQtyChange: (tenant_product_id: string, qty: number) => void;
  onRemove: (tenant_product_id: string) => void;
  showDivider: boolean;
}) {
  const subline = [item.brand, item.internal_sku].filter(Boolean).join(' · ');

  return (
    <>
      {showDivider && <div style={{ borderTop: '1px solid var(--border-1)' }} />}
      <div className="flex gap-3 px-4 py-3.5">
        {/* Thumbnail 56×56 */}
        <div
          className="rounded-lg flex items-center justify-center overflow-hidden shrink-0"
          style={{ width: 56, height: 56, background: 'var(--cream-100)' }}
        >
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-6 w-6" style={{ color: 'var(--cream-400)' }} />
          )}
        </div>

        {/* Left: name + sku + delete */}
        <div className="flex flex-1 min-w-0 flex-col justify-between py-0.5">
          <div className="min-w-0">
            <p className="font-semibold leading-snug truncate" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1, var(--cream-900))' }}>
              {item.name}
            </p>
            {subline ? (
              <p className="mt-0.5 truncate" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3, var(--cream-600))' }}>
                {subline}
              </p>
            ) : null}
          </div>
          <button
            onClick={() => onRemove(item.tenant_product_id)}
            className="self-start mt-1.5"
            style={{ color: 'var(--cream-400)' }}
            aria-label="Remove item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right: qty stepper + item total */}
        <div className="flex flex-col items-end justify-between shrink-0 py-0.5">
          {/* Pill stepper — no input, just buttons */}
          <div className="flex items-center" style={{ borderRadius: 999, overflow: 'hidden', background: 'var(--teal-500)' }}>
            <button
              onClick={() => onQtyChange(item.tenant_product_id, item.quantity - 1)}
              className="flex items-center justify-center"
              style={{ width: 24, height: 24, color: '#fff' }}
              aria-label="Decrease"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span
              className="tabular-nums font-semibold text-center"
              style={{ minWidth: '1.25rem', fontSize: 'var(--b-text-sub)', fontFamily: 'var(--font-mono)', color: '#fff' }}
            >
              {item.quantity}
            </span>
            <button
              onClick={() => onQtyChange(item.tenant_product_id, item.quantity + 1)}
              className="flex items-center justify-center"
              style={{ width: 24, height: 24, color: '#fff' }}
              aria-label="Increase"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          </div>
          {/* Item total */}
          <span
            className="tabular-nums font-semibold"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-body)', color: 'var(--fg-1, var(--cream-900))', letterSpacing: '-0.01em' }}
          >
            {formatCurrency(item.line_total)}
          </span>
        </div>
      </div>
    </>
  );
}
