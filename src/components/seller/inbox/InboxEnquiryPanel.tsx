'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ChevronDown, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useEnquiryTriage, useSubstituteEnquiryLine } from '@/hooks/useInboxEntries';
import { useEstimateComposer } from '@/hooks/useEstimates';
import type { EnquiryTriageLine } from '@/lib/inbox/enquiry-triage';
import { buildTargetRangeLabel } from '@/lib/inbox/inbox-entry-copy';
import { cn, formatNumberValue } from '@/lib/utils';
import { StockCell, VelocityCell, velocityLabel } from './EnquiryLineDisplay';

const HEAD_CLASS = 'text-xs font-medium uppercase tracking-[0.08em] text-cream-500';

function money(value: number) {
  return formatNumberValue(value, 'CURRENCY_EXACT');
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

function ReadOnlyLineCard({ line, imageUrl, estimateId, entryId }: { line: EnquiryTriageLine; imageUrl: string | null; estimateId: string; entryId: string }) {
  const [altsOpen, setAltsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const short = line.stock.tone !== 'ok';
  const targetLabel = buildTargetRangeLabel(line.targetMin, line.targetMax);
  const altLabel = line.alternates.length > 0
    ? `${line.alternates.length} alternative${line.alternates.length === 1 ? '' : 's'}`
    : 'No alternatives';

  return (
    <div className="overflow-hidden rounded-[14px] border border-cream-200">
      <div className={cn('px-4 py-4', line.stock.tone === 'danger' && 'doc-line-stock-danger', line.stock.tone === 'warning' && 'doc-line-stock-warning')}>
        <div className="flex items-start gap-3">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-cream-200 bg-cream-100">
            {imageUrl && !imgError ? (
              <Image src={imageUrl} alt="" fill className="object-cover" sizes="56px" unoptimized onError={() => setImgError(true)} />
            ) : (
              <Package className="h-5 w-5 text-cream-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-cream-900">{line.name}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-cream-500">
              {line.sku}{line.brandName ? ` · ${line.brandName}` : ''}
            </p>
            {line.buyerNote ? <p className="mt-1 text-xs italic text-cream-600">&ldquo;{line.buyerNote}&rdquo;</p> : null}
          </div>
        </div>

        {/* Mobile: 2 cols x 3 rows (target|resolved, qty|quote, stock|sales) so "Your quote"
            sits under "Resolved price". Desktop: 3 cols -- line 1 target/resolved/quote,
            line 2 stock/sales/qty. */}
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="order-1">
            <p className={HEAD_CLASS}>Buyer target</p>
            <p className="mt-0.5 font-mono text-sm text-cream-700">{targetLabel ?? 'None given'}</p>
          </div>
          <div className="order-2">
            <p className={HEAD_CLASS}>Resolved price</p>
            <p className="mt-0.5 font-mono text-sm text-cream-700">{line.resolvedPrice != null ? money(line.resolvedPrice) : '—'}</p>
          </div>
          <div className="order-4 sm:order-3">
            <p className={HEAD_CLASS}>Your quote</p>
            {line.unitPrice != null && line.unitPrice > 0 ? (
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-cream-900">{money(line.unitPrice)}</p>
            ) : (
              <p className="mt-0.5 text-sm text-cream-500">Not quoted yet</p>
            )}
          </div>
          <div className="order-5 sm:order-4">
            <p className={HEAD_CLASS}>Stock</p>
            <StockCell stock={line.stock} onHand={line.onHand} align="start" />
          </div>
          <div className="order-6 sm:order-5">
            <p className={HEAD_CLASS}>Recent sales</p>
            <VelocityCell velocity={line.velocity} align="start" />
          </div>
          <div className="order-3 sm:order-6">
            <p className={HEAD_CLASS}>Buyer quantity</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-cream-900">{line.qty}</p>
          </div>
        </div>

        {short ? (
          <button
            type="button"
            onClick={() => setAltsOpen((v) => !v)}
            aria-expanded={altsOpen}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cream-800 hover:text-cream-950"
          >
            {altLabel}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', altsOpen && 'rotate-180')} aria-hidden />
          </button>
        ) : null}
      </div>
      {short && altsOpen ? <AlternatesList line={line} estimateId={estimateId} entryId={entryId} /> : null}
    </div>
  );
}

export function InboxEnquirySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading enquiry">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-[14px] bg-cream-100" />
      ))}
    </div>
  );
}

export function InboxEnquiryPanel({ entryId }: { entryId: string }) {
  const { data, isLoading, isError } = useEnquiryTriage(entryId);
  const composer = useEstimateComposer(data?.estimateId ?? null).data;

  if (isLoading) return <InboxEnquirySkeleton />;
  if (isError || !data) {
    return <p className="text-sm text-cream-600">Couldn&apos;t load enquiry items.</p>;
  }

  const imageById = new Map((composer?.items ?? []).map((item) => [item.id, item.image_url ?? null]));
  const hasTotals = composer?.total_amount != null;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {data.lines.map((line) => (
          <ReadOnlyLineCard
            key={line.id}
            line={line}
            imageUrl={imageById.get(line.id) ?? null}
            estimateId={data.estimateId}
            entryId={entryId}
          />
        ))}
      </div>

      {hasTotals ? (
        <div className="rounded-[14px] border border-cream-300 bg-cream-50 px-4 py-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-cream-700">Subtotal</span>
              <span className="font-mono text-cream-900">{money(Number(composer?.subtotal ?? 0))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-cream-700">GST</span>
              <span className="font-mono text-cream-900">{money(Number(composer?.tax_amount ?? 0))}</span>
            </div>
            <div className="flex items-center justify-between border-t border-cream-200 pt-2 text-base">
              <span className="font-medium text-cream-900">Total</span>
              <span className="font-mono font-semibold text-cream-950">{money(Number(composer?.total_amount ?? 0))}</span>
            </div>
          </div>
        </div>
      ) : null}

      {composer?.seller_note ? (
        <div className="rounded-[14px] border border-cream-200 px-4 py-3">
          <p className={HEAD_CLASS}>Your note to the buyer</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-cream-800">{composer.seller_note}</p>
        </div>
      ) : null}
    </div>
  );
}
