'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

function OrderPlacedContent() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('order_id') ?? params.get('id') ?? '';
  const orderNumber = params.get('order_number') ?? params.get('num') ?? '';
  const total = Number(params.get('total') ?? '0');

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
          onClick={() => router.push('/buy/home')}
          className="w-8 h-8 flex items-center justify-center rounded-md"
          style={{ color: 'var(--fg-1, var(--cream-900))' }}
          aria-label="Go home"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold" style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}>
          Order placed
        </h1>
      </header>

      {/* Main content */}
      <div className="flex flex-col items-center px-6 pt-12 pb-32 text-center">
        {/* Ember check circle */}
        <div
          className="flex items-center justify-center rounded-full mb-6"
          style={{ width: 84, height: 84, background: 'var(--ember-50)', border: '1px solid var(--ember-200)' }}
        >
          <CheckCircle2 className="w-9 h-9" style={{ color: 'var(--ember-400)' }} />
        </div>

        <h2
          className="mb-2"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-page)', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-1, var(--cream-900))' }}
        >
          Order placed!
        </h2>
        <p className="mb-10" style={{ fontSize: 'var(--b-text-body)', color: 'var(--fg-3, var(--cream-600))' }}>
          Your distributor will review and confirm it shortly.
        </p>

        {/* Receipt card */}
        {(orderNumber || orderId) && (
          <div
            className="w-full rounded-2xl overflow-hidden text-left"
            style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: '1px solid var(--border-1)', background: 'var(--cream-50)' }}
            >
              <p className="font-semibold uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em', color: 'var(--cream-600)' }}>
                Order receipt
              </p>
            </div>
            <div className="px-4 py-4 space-y-3">
              {orderNumber && (
                <ReceiptRow label="Order #" value={orderNumber} mono />
              )}
              <ReceiptRow
                label="Status"
                value={
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: '#FEF3C7', color: '#92400E' }}
                  >
                    Received
                  </span>
                }
              />
              {total > 0 && (
                <ReceiptRow label="Total" value={formatCurrency(total)} mono />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div
        className="fixed bottom-0 left-1/2 z-20 w-full px-4 pt-3"
        style={{
          transform: 'translateX(-50%)',
          maxWidth: 468,
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(253, 251, 247, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        <button
          onClick={() => router.push('/buy/catalog')}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--teal-500)' }}
        >
          Back to catalog
        </button>
      </div>
    </>
  );
}

function OrderPlacedFallback() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 gap-4 text-center animate-pulse">
      <div className="w-14 h-14 rounded-full" style={{ background: 'var(--cream-100)' }} />
      <div className="h-6 w-40 rounded" style={{ background: 'var(--cream-200)' }} />
      <div className="h-4 w-60 rounded" style={{ background: 'var(--cream-100)' }} />
    </div>
  );
}

export default function OrderPlacedPage() {
  return (
    <Suspense fallback={<OrderPlacedFallback />}>
      <OrderPlacedContent />
    </Suspense>
  );
}

function ReceiptRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-3, var(--cream-600))' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--b-text-label)',
          fontWeight: 500,
          color: 'var(--fg-1, var(--cream-900))',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
