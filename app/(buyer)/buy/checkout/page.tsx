'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, MapPin, ShoppingBag } from 'lucide-react';
import { useCart } from '@/contexts/BuyerCartContext';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { apiFetch } from '@/lib/api-fetch';
import { deriveBuyerPlaceOfSupply } from '@/lib/buyer-routing';
import { computeBuyerCartTotals } from '@/lib/gst';
import posthog from 'posthog-js';

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart, subtotal, resolvedCampaignId } = useCart();
  const { data: meData } = useBuyerMe();
  const delivery = useBuyerDeliveryOptional();
  const selectedDelivery = delivery?.selected ?? null;
  const gstInclusive = meData?.business_policy.gst_inclusive ?? false;
  const gstRate = meData?.business_policy.gst_rate ?? 18;
  const totals = useMemo(
    () =>
      computeBuyerCartTotals(
        items.map((item) => ({
          quantity: item.quantity,
          unit_price: item.unit_price,
          disc_pct: 0,
          gst_rate: item.gst_rate ?? gstRate,
        })),
        gstInclusive,
        gstRate,
      ),
    [items, gstInclusive, gstRate],
  );
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to cart if empty
  useEffect(() => {
    if (items.length === 0) {
      router.replace('/buy/cart');
    }
  }, [items.length, router]);

  // Don't render anything while redirecting
  if (items.length === 0) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    if (!selectedDelivery) {
      setError('Select a delivery location before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const nearestRes = await apiFetch(`/api/buyer/nearest-location?lat=${selectedDelivery.lat}&lng=${selectedDelivery.lng}`);
      const nearest = await nearestRes.json() as { location_id: string | null };
      if (!nearest.location_id) {
        setError('Select a delivery location that can be routed to a warehouse.');
        return;
      }
      const res = await apiFetch('/api/buyer/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            tenant_product_id: i.tenant_product_id,
            qty: i.quantity,
            unit_price: i.unit_price,
            gst_rate: i.gst_rate ?? gstRate,
            product_name: i.name,
          })),
          notes: notes.trim() || undefined,
          location_id: nearest.location_id,
          place_of_supply: deriveBuyerPlaceOfSupply(selectedDelivery),
          campaign_id: resolvedCampaignId ?? undefined,
        }),
      });
      const data: { success: boolean; estimate_id?: string; estimate_number?: string | null; error?: string } = await res.json();
      if (data.success) {
        posthog.capture('inquiry_submitted', {
          estimate_id: data.estimate_id,
          estimate_number: data.estimate_number,
          item_count: items.length,
          subtotal,
          tax_amount: totals.tax_amount,
        });
        clearCart();
        router.replace(`/buy/orders?tab=inquiries&highlight=${data.estimate_id}`);
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4"
        style={{
          height: 'var(--header-h)',
          background: 'rgba(253, 251, 247, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[var(--cream-800)]"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <h1
          className="font-semibold text-[var(--fg-1)]"
          style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)' }}
        >
          Review Your Inquiry
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Cart summary */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-1)' }}
          >
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}
          >
            Items
          </p>

          <div className="space-y-2">
            {items.map(item => (
              <div key={item.tenant_product_id} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cream-900 truncate">{item.name}</p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}
                  >
                    {item.quantity} × {inr(item.unit_price)}
                  </p>
                </div>
                <span
                  className="text-sm font-semibold shrink-0"
                  style={{ color: 'var(--cream-900)', fontFamily: 'var(--font-mono)' }}
                >
                  {inr(item.quantity * item.unit_price)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="flex items-center justify-between pt-3"
            style={{ borderTop: '1px solid var(--border-1)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--cream-900)' }}>
              Subtotal
            </span>
            <span
              className="text-base font-bold"
              style={{ color: 'var(--cream-900)', fontFamily: 'var(--font-mono)' }}
            >
              {inr(totals.subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--fg-3, var(--cream-700))' }}>
              {gstInclusive ? 'GST included in prices' : 'GST'}
            </span>
            <span
              className="text-base font-semibold"
              style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
            >
              {gstInclusive ? 'Included' : inr(totals.tax_amount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--fg-3, var(--cream-700))' }}>
              Delivery
            </span>
            <span className="text-base font-semibold" style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}>
              Included
            </span>
          </div>
          <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border-1)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--cream-900)' }}>
              Total
            </span>
            <span className="text-base font-bold" style={{ color: 'var(--cream-900)', fontFamily: 'var(--font-mono)' }}>
              {inr(totals.total)}
            </span>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label
            htmlFor="notes"
            className="text-sm font-medium"
            style={{ color: 'var(--cream-800)' }}
          >
            Special instructions
            <span className="ml-1 text-xs font-normal" style={{ color: 'var(--cream-500)' }}>
              (optional)
            </span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
            placeholder="Any special instructions?"
            className="w-full resize-none rounded-lg p-3 text-sm text-cream-900 placeholder:text-cream-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow"
            style={{
              height: '6rem',
              background: 'var(--bg-recessed)',
              border: '1px solid var(--border-1)',
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => router.push('/buy/location?returnTo=' + encodeURIComponent('/buy/checkout'))}
          className="w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left"
          style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}
        >
          <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ember-50)' }}>
            <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--ember-400)' }} />
          </div>
          <div className="flex-1 min-w-0">
            {selectedDelivery ? (
              <>
                <p className="uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>Deliver to</p>
                <p className="font-semibold truncate" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1, var(--cream-900))' }}>
                  {selectedDelivery.label}
                </p>
                <p className="truncate" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3, var(--cream-600))' }}>
                  {[selectedDelivery.city, selectedDelivery.pincode].filter(Boolean).join(' · ')}
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
          <div
            className="rounded-lg p-3 text-sm"
            style={{
              background: 'var(--danger-50)',
              color: 'var(--danger-500)',
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !selectedDelivery}
          className="w-full h-12 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: 'var(--teal-500)' }}
        >
          {submitting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting…
            </>
          ) : (
            <>
              <ShoppingBag size={16} />
              Submit Inquiry
            </>
          )}
        </button>
      </div>
    </div>
  );
}
