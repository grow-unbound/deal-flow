'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useEnquiryTriage, useSubstituteEnquiryLine } from '@/hooks/useInboxEntries';
import type { EnquiryTriageLine, EnquiryVelocity } from '@/lib/inbox/enquiry-triage';
import { cn, formatNumberValue } from '@/lib/utils';

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_3.5rem_7.5rem] items-start gap-x-4 sm:grid-cols-[minmax(0,1fr)_3.5rem_8.5rem_6.5rem_6.5rem]';
const HEAD_CLASS = 'text-xs font-medium uppercase tracking-[0.08em] text-cream-500';

function money(value: number) {
  return formatNumberValue(value, 'CURRENCY_EXACT');
}

function velocityLabel(v: EnquiryVelocity): string {
  if (v.unitsPerWeek <= 0) return 'No recent sales';
  return `~${v.unitsPerWeek}/wk`;
}

function priceCell(line: EnquiryTriageLine, hidden: boolean) {
  if (hidden) {
    if (line.targetMin == null || line.targetMax == null) {
      return <span className="text-cream-500">No target</span>;
    }
    const range = line.targetMin === line.targetMax ? money(line.targetMin) : `${money(line.targetMin)} – ${money(line.targetMax)}`;
    return (
      <span className="flex flex-col items-end">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-cream-500">Buyer target</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-cream-900">{range}</span>
      </span>
    );
  }
  return line.unitPrice != null
    ? <span className="font-mono text-sm font-semibold tabular-nums text-cream-900">{money(line.unitPrice)}</span>
    : <span className="text-cream-500">—</span>;
}

function StockCell({ line }: { line: EnquiryTriageLine }) {
  const { tone, label } = line.stock;
  return (
    <span className="flex flex-col items-end">
      <span
        className={cn(
          'text-sm font-semibold',
          tone === 'danger' && 'text-danger-700',
          tone === 'warning' && 'text-amber-800',
          tone === 'ok' && 'text-cream-700',
        )}
      >
        {tone === 'danger' || tone === 'warning' ? '▲ ' : null}
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-cream-500">{line.onHand} on hand</span>
    </span>
  );
}

function VelocityCell({ velocity }: { velocity: EnquiryVelocity }) {
  return (
    <span className="flex flex-col items-end">
      <span className="font-mono text-sm tabular-nums text-cream-800">{velocityLabel(velocity)}</span>
      {velocity.daysCover != null ? (
        <span className="font-mono text-xs tabular-nums text-cream-500">{Math.round(velocity.daysCover)}d cover</span>
      ) : null}
    </span>
  );
}

function AlternatesList({ line, estimateId, entryId }: { line: EnquiryTriageLine; estimateId: string; entryId: string }) {
  const substitute = useSubstituteEnquiryLine(entryId);
  const [substitutingId, setSubstitutingId] = useState<string | null>(null);

  async function handleSubstitute(alt: EnquiryTriageLine['alternates'][number]) {
    setSubstitutingId(alt.tenantProductId);
    try {
      await substitute.mutateAsync({ estimateId, lineId: line.id, tenantProductId: alt.tenantProductId });
      toast.success(`Substituted with ${alt.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not substitute this item');
    } finally {
      setSubstitutingId(null);
    }
  }

  return (
    <div className="border-t border-cream-200 bg-cream-50 px-4 py-4">
      <p className="text-sm text-cream-700">
        Buyer asked for {line.qty}; {line.onHand} available.
        {line.alternates.length > 0
          ? ' In-stock alternatives, same category first — substituting updates this line in place:'
          : ' No in-stock alternatives found in this category or brand.'}
      </p>
      {line.alternates.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {line.alternates.map((alt) => {
            const isPending = substitute.isPending && substitutingId === alt.tenantProductId;
            return (
              <li
                key={alt.tenantProductId}
                className="flex items-center justify-between gap-4 rounded-[10px] border border-cream-300 bg-white px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-cream-900">{alt.name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-cream-500">
                    {alt.sku}
                    {alt.sameCategory ? ' · same category' : ''}
                    {alt.sameBrand ? ' · same brand' : alt.brandName ? ` · ${alt.brandName}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <span className="font-mono text-sm font-semibold tabular-nums text-cream-900">
                    {alt.buyerPrice != null ? money(alt.buyerPrice) : '—'}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-cream-800">{alt.available} in stock</span>
                  <span className="hidden font-mono text-xs tabular-nums text-cream-500 sm:inline">{velocityLabel(alt.velocity)}</span>
                  <button
                    type="button"
                    disabled={substitute.isPending}
                    onClick={() => void handleSubstitute(alt)}
                    className="inline-flex items-center rounded-[10px] border border-cream-300 bg-white px-3 py-1.5 text-sm font-medium text-cream-900 transition-colors hover:bg-cream-100 disabled:opacity-50"
                  >
                    {isPending ? 'Substituting…' : 'Substitute'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function LineRow({ line, hidden, estimateId, entryId }: { line: EnquiryTriageLine; hidden: boolean; estimateId: string; entryId: string }) {
  const [open, setOpen] = useState(false);
  const short = line.stock.tone !== 'ok';
  const altLabel = line.alternates.length > 0
    ? `${line.alternates.length} alternative${line.alternates.length === 1 ? '' : 's'}`
    : 'No alternatives';

  return (
    <div>
      <div
        className={cn(
          ROW_GRID,
          'px-4 py-3.5',
          line.stock.tone === 'danger' && 'doc-line-stock-danger',
          line.stock.tone === 'warning' && 'doc-line-stock-warning',
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-cream-900">{line.name}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-cream-500">
            {line.sku}{line.brandName ? ` · ${line.brandName}` : ''}
          </p>
          {line.buyerNote ? <p className="mt-1 text-xs italic text-cream-600">&ldquo;{line.buyerNote}&rdquo;</p> : null}
          {short ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-cream-800 hover:text-cream-950"
            >
              {altLabel}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
          ) : null}
          <div className="mt-1.5 flex gap-4 sm:hidden">
            <StockCell line={line} />
            <VelocityCell velocity={line.velocity} />
          </div>
        </div>
        <span className="text-right font-mono text-sm font-semibold tabular-nums text-cream-900">{line.qty}</span>
        <span className="text-right">{priceCell(line, hidden)}</span>
        <span className="hidden text-right sm:block"><StockCell line={line} /></span>
        <span className="hidden text-right sm:block"><VelocityCell velocity={line.velocity} /></span>
      </div>
      {short && open ? <AlternatesList line={line} estimateId={estimateId} entryId={entryId} /> : null}
    </div>
  );
}

export function InboxEnquirySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading enquiry">
      <div className="h-4 w-56 animate-pulse rounded-full bg-cream-200" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[52px] animate-pulse rounded-[10px] bg-cream-100" />
      ))}
    </div>
  );
}

export function InboxEnquiryPanel({ entryId }: { entryId: string }) {
  const { data, isLoading, isError } = useEnquiryTriage(entryId);

  if (isLoading) return <InboxEnquirySkeleton />;
  if (isError || !data) {
    return <p className="text-sm text-cream-600">Couldn&apos;t load enquiry items.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[12px] border border-cream-200">
        <div className={cn(ROW_GRID, 'border-b border-cream-200 bg-cream-50 px-4 py-2.5')}>
          <span className={HEAD_CLASS}>Item</span>
          <span className={cn(HEAD_CLASS, 'text-right')}>Qty</span>
          <span className={cn(HEAD_CLASS, 'text-right')}>{data.hiddenPricing ? 'Target' : 'Price'}</span>
          <span className={cn(HEAD_CLASS, 'hidden text-right sm:block')}>Stock</span>
          <span className={cn(HEAD_CLASS, 'hidden text-right sm:block')}>Velocity</span>
        </div>
        <div className="divide-y divide-cream-200">
          {data.lines.map((line) => (
            <LineRow key={line.id} line={line} hidden={data.hiddenPricing} estimateId={data.estimateId} entryId={entryId} />
          ))}
        </div>
      </div>

    </div>
  );
}
