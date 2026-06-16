'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Minus, Plus, Package, ArrowLeft, MapPin, ChevronRight } from 'lucide-react';
import { useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
// Inline type to avoid cross-boundary import
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
        <header
          className="sticky top-0 z-20 flex items-center gap-2 px-4"
          style={{
            height: 'var(--header-h, 56px)',
            background: 'rgba(253, 251, 247, 0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border-1)',
          }}
        >
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-md"
            style={{ color: 'var(--fg-1, var(--cream-900))' }}
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
            My Cart
          </h1>
        </header>

        <div className="flex flex-col items-center justify-center px-6 py-24 gap-4 text-center">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: 'var(--cream-100)' }}
          >
            <ShoppingCart className="w-8 h-8" style={{ color: 'var(--cream-400)' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
              Your cart is empty
            </h2>
            <p className="text-sm" style={{ color: 'var(--fg-3, var(--cream-600))' }}>
              Add products from the catalog to get started.
            </p>
          </div>
          <button
            onClick={() => router.push('/buy/catalog')}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--teal-500)' }}
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
      <header
        className="sticky top-0 z-20 flex items-center gap-2 px-4"
        style={{
          height: 'var(--header-h, 56px)',
          background: 'rgba(253, 251, 247, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-md"
          style={{ color: 'var(--fg-1, var(--cream-900))' }}
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold flex-1" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
          My Cart
        </h1>
        <span className="text-xs font-medium" style={{ color: 'var(--fg-3, var(--cream-600))' }}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </header>

      {/* Scrollable content */}
      <div className="px-4 pt-4 space-y-3" style={{ paddingBottom: '9rem' }}>
        {/* Inline page head */}
        <div className="pb-1">
          <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--cream-500)' }}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </p>
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}
          >
            Review &amp; place
          </h2>
        </div>

        {/* Cart items */}
        {items.map((item) => (
          <CartPageItem
            key={item.tenant_product_id}
            item={item}
            onQtyChange={updateQty}
            onRemove={removeItem}
          />
        ))}

        {/* Totals card */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}
        >
          <div className="px-4 py-3 space-y-2.5">
            <TotalsRow label="Subtotal" value={formatCurrency(subtotal)} />
            <TotalsRow label="GST (18%)" value={formatCurrency(gstAmount)} />
            <TotalsRow label="Delivery" value={deliveryFee === 0 ? 'Free' : formatCurrency(deliveryFee)} />
          </div>
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderTop: '1px solid var(--border-1)', background: 'var(--cream-50)' }}
          >
            <span className="text-sm font-bold" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
              Total
            </span>
            <span
              className="text-base font-bold"
              style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
            >
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* Delivery card */}
        <button
          onClick={() => router.push('/buy/location')}
          className="w-full rounded-xl p-4 flex items-start gap-3 text-left"
          style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}
        >
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 mt-0.5"
            style={{ background: 'var(--teal-50, #E6F4F1)' }}
          >
            <MapPin className="w-4 h-4" style={{ color: 'var(--teal-500)' }} />
          </div>
          <div className="flex-1 min-w-0">
            {delivery?.selected ? (
              <>
                <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
                  {delivery.selected.label}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--fg-3, var(--cream-600))' }}>
                  {delivery.selected.formatted_address}
                </p>
                <p className="text-xs mt-1 font-medium" style={{ color: 'var(--teal-500)' }}>
                  2–3 working days
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
                  Set delivery location
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3, var(--cream-600))' }}>
                  Tap to choose where to deliver
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 self-center">
            <span className="text-xs font-medium" style={{ color: 'var(--teal-500)' }}>
              Change
            </span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--teal-500)' }} />
          </div>
        </button>

        {/* Error */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: '#FEE2E2', color: '#B91C1C' }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div
        className="fixed bottom-0 left-1/2 z-20 w-full px-4 pt-3"
        style={{
          transform: 'translateX(-50%)',
          maxWidth: BUYER_PREVIEW_MAX_WIDTH,
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(253, 251, 247, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        <div className="flex gap-2">
          <button
            onClick={handleRequestQuote}
            disabled={isBusy}
            className="flex h-12 flex-1 items-center justify-center rounded-xl border text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ borderColor: 'var(--border-1)', color: 'var(--fg-1, var(--cream-900))', background: 'var(--bg-surface, #fff)' }}
          >
            {requestingQuote ? 'Requesting…' : 'Request quote'}
          </button>
          <button
            onClick={handlePlaceOrder}
            disabled={isBusy}
            className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: '#874720' }}
          >
            {placingOrder ? 'Placing order…' : `Place order · ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'var(--fg-3, var(--cream-700))' }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}>
        {value}
      </span>
    </div>
  );
}

function CartPageItem({
  item,
  onQtyChange,
  onRemove,
}: {
  item: BuyerCartItem;
  onQtyChange: (tenant_product_id: string, qty: number) => void;
  onRemove: (tenant_product_id: string) => void;
}) {
  return (
    <div
      className="flex gap-3 rounded-xl p-3"
      style={{
        background: 'var(--bg-surface, var(--cream-50))',
        border: '1px solid var(--border-1)',
      }}
    >
      {/* Thumbnail */}
      <div
        className="h-16 w-16 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
        style={{ background: 'var(--cream-100)' }}
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <Package className="h-6 w-6" style={{ color: 'var(--cream-400)' }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {item.brand && (
          <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--fg-3, var(--cream-500))' }}>
            {item.brand}
          </p>
        )}
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
          {item.name}
        </p>
        {item.internal_sku && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3, var(--cream-600))', fontFamily: 'var(--font-mono)' }}>
            {item.internal_sku}
          </p>
        )}
        <p className="text-xs mt-1" style={{ color: 'var(--fg-3, var(--cream-700))', fontFamily: 'var(--font-mono)' }}>
          {formatCurrency(item.unit_price)} × {item.quantity} ={' '}
          <span className="font-semibold" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
            {formatCurrency(item.line_total)}
          </span>
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <button
          onClick={() => onRemove(item.tenant_product_id)}
          className="w-7 h-7 flex items-center justify-center rounded-md"
          style={{ color: 'var(--cream-400)' }}
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex items-center rounded-lg overflow-hidden" style={{ background: 'var(--cream-100)' }}>
          <button
            onClick={() => onQtyChange(item.tenant_product_id, item.quantity - 1)}
            className="h-8 w-8 flex items-center justify-center"
            style={{ color: 'var(--teal-500)' }}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span
            className="text-sm font-semibold min-w-[2rem] text-center"
            style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
          >
            {item.quantity}
          </span>
          <button
            onClick={() => onQtyChange(item.tenant_product_id, item.quantity + 1)}
            className="h-8 w-8 flex items-center justify-center"
            style={{ color: 'var(--teal-500)' }}
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
