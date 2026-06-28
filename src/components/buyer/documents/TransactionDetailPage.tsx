'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { ErrorState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { apiFetch } from '@/lib/api-fetch';
import { useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TransactionLineItem {
  tenant_product_id: string;
  product_name: string;
  internal_sku: string | null;
  unit: string | null;
  qty: number;
  unit_price: number;
  tax_rate: number | null;
  line_total: number;
}

export interface TransactionDoc {
  /** Document identifier shown in header (order_number, estimate_number, invoice_number) */
  docNumber: string;
  status: string;
  /** ISO date string shown as the primary date */
  primaryDate: string;
  /** Label for the primary date field */
  primaryDateLabel: string;
  notes: string | null;
  subtotal: number;
  tax_total: number;
  total_amount: number;
  /** Extra amount shown below total (e.g. outstanding balance on invoices) */
  outstandingBalance?: number | null;
  items: TransactionLineItem[];
}

export type DocType = 'order' | 'estimate' | 'invoice';

interface TransactionDetailPageProps {
  id: string;
  title: string;
  endpoint: string;
  docType: DocType;
  /** Extract TransactionDoc from the API response payload */
  pickDoc: (payload: any) => TransactionDoc | null;
}

// ── Status pill mappings ──────────────────────────────────────────────────────

const orderStatusBadge: Record<string, { tone: StatusTone; label: string }> = {
  draft:               { tone: 'neutral', label: 'Draft' },
  received:            { tone: 'info', label: 'Received' },
  confirmed:           { tone: 'accent', label: 'Confirmed' },
  partially_dispatched:{ tone: 'warning', label: 'In Transit' },
  dispatched:          { tone: 'warning', label: 'Dispatched' },
  delivered:           { tone: 'success', label: 'Delivered' },
  cancelled:           { tone: 'danger', label: 'Cancelled' },
  pending:             { tone: 'info', label: 'Pending' },
  accepted:            { tone: 'success', label: 'Accepted' },
  declined:            { tone: 'danger', label: 'Declined' },
  paid:                { tone: 'success', label: 'Paid' },
  due:                 { tone: 'warning', label: 'Due' },
  overdue:             { tone: 'danger', label: 'Overdue' },
};

function getStatusBadge(status: string): { tone: StatusTone; label: string } {
  return orderStatusBadge[status] ?? { tone: 'neutral', label: status };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LineItemRow({ item }: { item: TransactionLineItem }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[var(--b-text-body)] font-medium text-[var(--cream-900)]">
          {item.product_name}
        </p>
        {item.internal_sku && (
          <p className="mt-0.5 font-mono text-[var(--b-text-eyebrow)] text-[var(--cream-600)]">
            {item.internal_sku}
          </p>
        )}
        <p className="mt-0.5 text-[var(--b-text-sub)] text-[var(--cream-600)]">
          {item.qty} {item.unit ?? 'unit'} × {inr(item.unit_price)}
        </p>
      </div>
      <p className="shrink-0 font-mono text-[var(--b-text-body)] font-semibold text-[var(--cream-900)]">
        {inr(item.line_total)}
      </p>
    </div>
  );
}

function TotalsBlock({
  subtotal,
  tax_total,
  total_amount,
  outstandingBalance,
}: {
  subtotal: number;
  tax_total: number;
  total_amount: number;
  outstandingBalance?: number | null;
}) {
  return (
    <div
      className="rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-4"
      style={{ background: 'white' }}
    >
      <div className="flex justify-between text-[var(--b-text-body)] text-[var(--cream-700)]">
        <span>Subtotal</span>
        <span className="font-mono">{inr(subtotal)}</span>
      </div>
      {tax_total > 0 && (
        <div className="mt-2 flex justify-between text-[var(--b-text-body)] text-[var(--cream-600)]">
          <span>GST (18%)</span>
          <span className="font-mono">{inr(tax_total)}</span>
        </div>
      )}
      <div className="mt-3 flex justify-between border-t border-[var(--border-1)] pt-3">
        <span className="font-semibold text-[var(--cream-900)]">Total</span>
        <span className="font-mono text-lg font-bold text-[var(--cream-900)]">{inr(total_amount)}</span>
      </div>
      {outstandingBalance != null && outstandingBalance > 0 && (
        <div className="mt-2 flex justify-between text-[var(--b-text-sub)] text-[var(--danger-500)]">
          <span>Outstanding</span>
          <span className="font-mono font-semibold">{inr(outstandingBalance)}</span>
        </div>
      )}
    </div>
  );
}

function ReorderButton({ items, docType }: { items: TransactionLineItem[]; docType: DocType }) {
  const router = useRouter();
  const { items: cartItems, clearCart, addItem } = useCart();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (docType === 'invoice') return null;

  function fillCart() {
    clearCart();
    items.forEach((item) => {
      const cartItem: BuyerCartItem = {
        tenant_product_id: item.tenant_product_id,
        name: item.product_name,
        internal_sku: item.internal_sku ?? undefined,
        unit_price: item.unit_price,
        unit: item.unit ?? undefined,
        quantity: item.qty,
        line_total: item.line_total,
      };
      addItem(cartItem);
    });
    router.push('/buy/cart');
  }

  function handleReorder() {
    if (cartItems.length > 0) {
      setConfirmOpen(true);
    } else {
      fillCart();
    }
  }

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <button
        type="button"
        onClick={handleReorder}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[var(--b-text-body)] font-semibold text-white transition-opacity active:opacity-80"
        style={{ background: 'var(--teal-500)' }}
      >
        <ShoppingCart className="h-4 w-4" />
        Reorder
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {cartCount} item{cartCount !== 1 ? 's' : ''} currently in your cart and replace them with items from this{' '}
              {docType === 'order' ? 'order' : 'enquiry'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                fillCart();
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TransactionDetailPage({
  id,
  title,
  endpoint,
  docType,
  pickDoc,
}: TransactionDetailPageProps) {
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState(false);
  const [doc, setDoc] = React.useState<TransactionDoc | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    apiFetch(endpoint)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        setDoc(pickDoc(payload));
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // pickDoc is a page-level constant; only re-fetch when the route id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, id]);

  const badge = doc ? getStatusBadge(doc.status) : null;

  return (
    <div className="flex min-h-[50vh] flex-col pb-[var(--tab-bar)]">
      <BuyerDetailShell title={title}>
        {loading ? (
          <div className="space-y-3 px-4 py-4">
            <div className="h-10 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
            <div className="h-40 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
            <div className="h-28 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
          </div>
        ) : fetchError ? (
          <div className="p-4">
            <ErrorState
              heading={`Couldn't load ${title.toLowerCase()}`}
              description="Check your connection and try again."
              onRetry={() => {
                setDoc(null);
                setLoading(true);
                setFetchError(false);
              }}
            />
          </div>
        ) : !doc ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">{title} not found.</div>
        ) : (
          <div className="space-y-3 px-4 py-4">
            {/* Header card — doc number + status + date */}
            <div
              className="rounded-2xl border border-[var(--border-1)] px-4 py-4"
              style={{ background: 'white' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[var(--b-text-body)] text-[var(--cream-600)]">
                    {doc.docNumber}
                  </p>
                  <p className="mt-1 text-[var(--b-text-sub)] text-[var(--cream-600)]">
                    {doc.primaryDateLabel}: {fmtDate(doc.primaryDate)}
                  </p>
                  {doc.notes && (
                    <p className="mt-1.5 text-[var(--b-text-body)] text-[var(--cream-800)]">
                      {doc.notes}
                    </p>
                  )}
                </div>
                {badge && <StatusPill label={badge.label} tone={badge.tone} />}
              </div>
            </div>

            {/* Line items */}
            {doc.items.length > 0 ? (
              <div
                className="rounded-2xl border border-[var(--border-1)] px-4"
                style={{ background: 'white' }}
              >
                {doc.items.map((item, idx) => (
                  <React.Fragment key={item.tenant_product_id + idx}>
                    <LineItemRow item={item} />
                    {idx < doc.items.length - 1 && (
                      <div className="h-px bg-[var(--border-1)]" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border-1)] px-4 py-6 text-center text-[var(--b-text-sub)] text-[var(--cream-600)]"
                style={{ background: 'white' }}>
                No items found.
              </div>
            )}

            {/* Totals */}
            <TotalsBlock
              subtotal={doc.subtotal}
              tax_total={doc.tax_total}
              total_amount={doc.total_amount}
              outstandingBalance={doc.outstandingBalance}
            />

            {/* Reorder CTA */}
            {doc.items.length > 0 && (
              <ReorderButton items={doc.items} docType={docType} />
            )}
          </div>
        )}
      </BuyerDetailShell>
    </div>
  );
}
