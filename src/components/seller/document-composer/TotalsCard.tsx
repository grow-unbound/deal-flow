'use client';

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
}: {
  title?: string;
  totals: EstimateComposerTotals;
  creditWarning: string | null;
  isInterState: boolean;
  previousTotals?: EstimateComposerTotals | null;
  lineCount: number;
  taxRows?: Array<{ label: string; value: number; previous?: number | null; rowClassName?: string }>;
}) {
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
      {creditWarning ? (
        <div className="callout callout--danger">
          <strong>Over limit.</strong> {creditWarning}
        </div>
      ) : null}

      <section className="rounded-[14px] border border-cream-300 bg-white p-4">
        <p className="text-[13px] font-semibold text-cream-950">{title}</p>
        <div className="mt-4 space-y-3 text-[12px] text-cream-700">
          <TotalRow label={`Subtotal (${lineCount} line${lineCount === 1 ? '' : 's'})`} value={formatInr(totals.subtotal)} previous={previousTotals?.subtotal ?? null} />
          <TotalRow label="Document discount" value={formatInr(totals.discount_flat)} previous={previousTotals?.discount_flat ?? null} />
          {resolvedTaxRows.map((row) => (
            <TotalRow
              key={row.label}
              label={row.label}
              value={formatInr(row.value)}
              previous={row.previous ?? null}
              rowClassName={row.rowClassName}
            />
          ))}
          <TotalRow label="Freight & packing" value={formatInr(totals.freight)} previous={previousTotals?.freight ?? null} />
          <TotalRow label="Round-off" value={formatInr(totals.round_off)} previous={previousTotals?.round_off ?? null} />
          <div className="border-t border-cream-200 pt-3">
            <TotalRow label="Grand total" value={formatInr(totals.grand_total)} previous={previousTotals?.grand_total ?? null} strong />
          </div>
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
        {previous != null ? <span className="text-[11px] text-cream-500 line-through">{formatInr(previous)}</span> : null}
        <span className={cn('font-mono text-[12px] text-cream-900', strong && 'text-[14px] font-semibold')}>{value}</span>
      </div>
    </div>
  );
}

function taxRateLabel(totals: EstimateComposerTotals) {
  if (totals.taxable_amount <= 0) return 0;
  return Math.round((totals.tax_amount / totals.taxable_amount) * 100);
}
