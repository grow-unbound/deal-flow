'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/contexts/BuyerCartContext';
import { apiFetch } from '@/lib/api-fetch';

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart, subtotal } = useCart();
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to cart if empty
  useEffect(() => {
    if (items.length === 0) {
      router.replace('/shop/cart');
    }
  }, [items.length, router]);

  // Don't render anything while redirecting
  if (items.length === 0) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/buyer/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            tenant_product_id: i.tenant_product_id,
            qty: i.quantity,
            unit_price: i.unit_price,
            product_name: i.name,
          })),
          notes: notes.trim() || undefined,
        }),
      });
      const data: { success: boolean; estimate_id?: string; error?: string } = await res.json();
      if (data.success) {
        clearCart();
        router.replace(`/shop/orders?tab=inquiries&highlight=${data.estimate_id}`);
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
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-cream-200 transition-colors"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <h1
          className="text-lg font-semibold text-cream-900"
          style={{ fontFamily: 'var(--font-display)' }}
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
              {inr(subtotal)}
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
          disabled={submitting}
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
