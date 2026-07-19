'use client';

import type { ReactNode } from 'react';

import { useBusinessPolicy } from '@/hooks/useBusinessPolicy';
import { cn, formatInr } from '@/lib/utils';
import type { EstimateComposerTotals } from '@/types/estimate-composer';

export function TotalsCard({
  title = 'Totals',
  totals,
  creditWarning,
  isInterState,
  previousTotals,
  lineCount,
  taxRows,
  stagedChanges,
  stagedCallout,
  gstInclusiveOverride,
}: {
  title?: string;
  totals: EstimateComposerTotals;
  creditWarning: string | null;
  isInterState: boolean;
  previousTotals?: EstimateComposerTotals | null;
  lineCount: number;
  taxRows?: Array<{ label: string; value: number; previous?: number | null; rowClassName?: string }>;
  stagedChanges?: Array<{ label: string; value: string }>;
  stagedCallout?: ReactNode;
  gstInclusiveOverride?: boolean;
}) {
  const { creditEnabled, gstInclusive } = useBusinessPolicy();
  const showGstInclusive = gstInclusiveOverride ?? gstInclusive;

  const resolvedTaxRows = taxRows && taxRows.length > 0
    ? taxRows
    : [
        {
          label: isInterState
            ? `IGST ${taxRateLabel(totals)}%`
            : `CGST ${taxRateLabel(totals) / 2}% + SGST ${taxRateLabel(totals) / 2}%`,
          value: totals.tax_amount,
          previous: previousTotals?.tax_amount ?? null,
        },
      ];

  return (
    <div className="space-y-3">
      {/* creditEnabled && creditWarning ? (
        <div className="callout callout--danger">
          <strong>Over limit.</strong> {creditWarning}
        </div>
      ) : null */}

      <section className="rounded-[14px] border border-cream-300 bg-white p-4">
        <p className="text-base font-semibold text-cream-950">{title}</p>
        <div className="mt-4 space-y-3 text-sm text-cream-700">
          <TotalRow label={`Subtotal (${lineCount} line${lineCount === 1 ? '' : 's'})`} value={formatInr(totals.subtotal)} previous={previousTotals?.subtotal ?? null} />
          <TotalRow label="Document discount" value={formatInr(totals.discount_flat)} previous={previousTotals?.discount_flat ?? null} />
          {showGstInclusive ? (
            <TotalRow
              label="GST"
              value="Included in prices"
              previous={null}
              rowClassName="text-cream-500"
            />
          ) : (
            resolvedTaxRows.map((row) => (
              <TotalRow
                key={row.label}
                label={row.label}
                value={formatInr(row.value)}
                previous={row.previous ?? null}
                rowClassName={row.rowClassName}
              />
            ))
          )}
          <TotalRow label="Freight & packing" value={formatInr(totals.freight)} previous={previousTotals?.freight ?? null} />
          <TotalRow label="Round-off" value={formatInr(totals.round_off)} previous={previousTotals?.round_off ?? null} />
          <div className="border-t border-cream-200 pt-3">
            <TotalRow label="Grand total" value={formatInr(totals.grand_total)} previous={previousTotals?.grand_total ?? null} strong />
          </div>
          {stagedChanges && stagedChanges.length > 0 ? (
            <div className="mt-4 space-y-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Staged changes</p>
              {stagedChanges.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4">
                  <span className="text-amber-800">{row.label}</span>
                  <span className="max-w-[180px] text-right font-medium text-amber-950">{row.value}</span>
                </div>
              ))}
              {stagedCallout ? <div className="pt-2 text-sm leading-[1.5] text-amber-900">{stagedCallout}</div> : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function TotalRow({
  label,
  value,
  previous,
  strong = false,
  rowClassName,
}: {
  label: string;
  value: string;
  previous: number | null;
  strong?: boolean;
  rowClassName?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4', rowClassName)}>
      <span className={cn(strong ? 'font-semibold text-cream-950' : '')}>{label}</span>
      <div className="flex items-center gap-2">
        {previous != null ? <span className="text-xs text-cream-500 line-through">{formatInr(previous)}</span> : null}
        <span className={cn('font-mono text-sm text-cream-900', strong && 'text-base font-semibold')}>{value}</span>
      </div>
    </div>
  );
}

function taxRateLabel(totals: EstimateComposerTotals) {
  if (totals.taxable_amount <= 0) return 0;
  return Math.round((totals.tax_amount / totals.taxable_amount) * 100);
}
