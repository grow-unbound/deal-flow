'use client';

import { MapPin, Package } from 'lucide-react';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';
import { cn, formatNumberValue } from '@/lib/utils';

interface SellerMobileTransactionLine {
  id: string;
  name: string;
  sku?: string | null;
  qty: number;
  unit?: string | null;
  unitPrice: number;
  lineTotal: number;
}

interface SellerMobileTransactionTotal {
  label: string;
  value: number | string;
  emphasis?: boolean;
  tone?: 'danger' | 'muted';
}

interface SellerMobileTransactionDetailProps {
  eyebrow: string;
  documentNumber: string;
  statusLabel: string;
  statusTone: StatusTone;
  buyerName?: string | null;
  buyerMeta?: string | null;
  dateLabel?: string | null;
  secondaryDateLabel?: string | null;
  locationName?: string | null;
  placeOfSupply?: string | null;
  notes?: string | null;
  lines: SellerMobileTransactionLine[];
  totals: SellerMobileTransactionTotal[];
  className?: string;
}

function formatValue(value: number | string) {
  return typeof value === 'number' ? formatNumberValue(value, 'CURRENCY_EXACT') : value;
}

function formatItemSummary(lines: SellerMobileTransactionLine[]) {
  const totalUnits = lines.reduce((sum, line) => sum + line.qty, 0);
  return `${lines.length} item${lines.length === 1 ? '' : 's'} · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}`;
}

function formatDateText(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\d{4}-\d{2}-\d{2}/g, (match) => {
    const parsed = new Date(`${match}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return match;
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  });
}

export function SellerMobileTransactionDetail({
  eyebrow,
  documentNumber,
  statusLabel,
  statusTone,
  buyerName,
  buyerMeta,
  dateLabel,
  secondaryDateLabel,
  locationName,
  placeOfSupply,
  notes,
  lines,
  totals,
  className,
}: SellerMobileTransactionDetailProps) {
  const subtitle = [formatDateText(dateLabel), formatDateText(secondaryDateLabel)].filter(Boolean).join(' · ');

  return (
    <div className={cn('md:hidden', className)}>
      <div className="space-y-3 px-4 pb-6 pt-4">
        <section className="px-1">
          <p
            className="text-xs font-medium uppercase text-[var(--cream-600)]"
            style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em' }}
          >
            {formatItemSummary(lines)}
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h1
              className="min-w-0 flex-1 font-mono font-semibold leading-tight text-[var(--cream-900)]"
              style={{ fontSize: 'var(--b-text-page-sm)', letterSpacing: '-0.02em' }}
            >
              {documentNumber}
            </h1>
            <StatusPill label={statusLabel} tone={statusTone} className="shrink-0" />
          </div>
          <p className="mt-1 text-[var(--b-text-sub)] text-[var(--cream-600)]">
            {subtitle || '—'}
          </p>
          <p className="sr-only">{eyebrow}</p>
        </section>

        <section className={cn(BUYER_CARD_RADIUS_CLASS, 'border border-[var(--border-1)] bg-white px-4 py-4')}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Buyer</p>
          <p className="mt-2 truncate text-[var(--b-text-body)] font-semibold text-cream-900">
            {buyerName || 'No buyer assigned'}
          </p>
          {buyerMeta ? <p className="mt-1 text-[var(--b-text-sub)] text-cream-600">{buyerMeta}</p> : null}
          {locationName || placeOfSupply ? (
            <div className="mt-3 flex items-start gap-2 text-[var(--b-text-sub)] text-cream-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cream-500" />
              <span>{[locationName, placeOfSupply].filter(Boolean).join(' · ')}</span>
            </div>
          ) : null}
        </section>

        <section className={cn(BUYER_CARD_RADIUS_CLASS, 'border border-[var(--border-1)] bg-white px-4 py-4')}>
          {lines.length > 0 ? (
            <div>
              {lines.map((line, index) => (
                <div key={line.id}>
                  <div className="flex items-start gap-3 py-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border-1)] bg-[var(--cream-100)]">
                      <Package className="h-5 w-5 text-[var(--cream-400)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[var(--b-text-body)] font-semibold text-[var(--cream-900)]">{line.name}</p>
                      {line.sku ? <p className="mt-0.5 font-mono text-[var(--b-text-eyebrow)] text-[var(--cream-600)]">{line.sku}</p> : null}
                      <p className="mt-1 text-[var(--b-text-sub)] text-[var(--cream-600)]">
                        {line.qty} {line.unit ?? 'unit'} × {formatNumberValue(line.unitPrice, 'CURRENCY_EXACT')}
                      </p>
                    </div>
                    <p className="shrink-0 text-right font-mono text-[var(--b-text-body)] font-semibold text-[var(--cream-900)]">
                      {formatNumberValue(line.lineTotal, 'CURRENCY_EXACT')}
                    </p>
                  </div>
                  {index < lines.length - 1 ? <div className="h-px bg-[var(--border-1)]" /> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-2 text-center text-[var(--b-text-sub)] text-[var(--cream-600)]">No line items.</p>
          )}
        </section>

        <section className={cn(BUYER_CARD_RADIUS_CLASS, 'border border-[var(--border-1)] bg-white px-4 py-4')}>
          <div className="space-y-2 text-[var(--b-text-body)]">
            {totals.map((total) => (
              <div
                key={total.label}
                className={cn(
                  'flex justify-between gap-4',
                  total.emphasis && 'border-t border-[var(--border-1)] pt-3',
                  total.tone === 'danger' ? 'text-[var(--danger-500)]' : total.tone === 'muted' ? 'text-[var(--cream-600)]' : 'text-[var(--cream-700)]',
                )}
              >
                <span className={cn(total.emphasis && 'font-semibold text-[var(--cream-900)]')}>{total.label}</span>
                <span
                  className={cn(
                    'font-mono',
                    total.emphasis && 'text-[var(--b-text-total)] font-bold text-[var(--cream-900)]',
                    total.tone === 'danger' && 'font-semibold',
                  )}
                >
                  {formatValue(total.value)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {notes ? (
          <section className={cn(BUYER_CARD_RADIUS_CLASS, 'border border-[var(--border-1)] bg-white px-4 py-4')}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-[var(--b-text-body)] leading-6 text-[var(--cream-800)]">{notes}</p>
          </section>
        ) : null}

      </div>
    </div>
  );
}

export type { SellerMobileTransactionDetailProps, SellerMobileTransactionLine, SellerMobileTransactionTotal };
