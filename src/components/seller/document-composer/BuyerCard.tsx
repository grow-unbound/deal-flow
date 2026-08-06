'use client';

import { Search } from 'lucide-react';
import { useRef, useState } from 'react';

import { EntityAvatar } from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOverlayPlacement } from '@/hooks/useOverlayPlacement';
import { useBusinessPolicy } from '@/hooks/useBusinessPolicy';
import type {
  EstimateComposerBuyerContext,
  EstimateComposerCreditTone,
  EstimateComposerPriceListOption,
} from '@/types/estimate-composer';
import {
  hasEstimateComposerCreditLimit,
  resolveEstimateComposerCreditPreviewPct,
  resolveEstimateComposerCreditTone,
  resolveEstimateComposerCreditUsedPct,
} from '@/types/estimate-composer';
import { cn, formatNumberValue } from '@/lib/utils';

type BuyerCardEmptyRow = Pick<EstimateComposerBuyerContext, 'id' | 'business_name' | 'place_of_supply'>;

export function BuyerCardEmpty({
  query,
  results,
  recentBuyers,
  searchOpen = false,
  searchLoading = false,
  onQueryChange,
  onSearchOpenChange,
  onSelectBuyer,
}: {
  query: string;
  results?: BuyerCardEmptyRow[];
  recentBuyers?: BuyerCardEmptyRow[];
  searchOpen?: boolean;
  searchLoading?: boolean;
  onQueryChange: (value: string) => void;
  onSearchOpenChange?: (open: boolean) => void;
  onSelectBuyer: (buyerId: string) => void;
}) {
  const displayRows = results ?? recentBuyers ?? [];
  const anchorRef = useRef<HTMLDivElement>(null);
  const placement = useOverlayPlacement(Boolean(searchOpen), anchorRef);

  return (
    <aside className="rounded-[14px] border border-cream-300 bg-white p-4">
      <p className="text-base font-semibold text-cream-950">Buyer</p>
      <p className="mt-1 text-sm leading-[1.55] text-cream-700">Pick a buyer to start pricing and credit checks.</p>
      <div ref={anchorRef} className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => onSearchOpenChange?.(true)}
          onBlur={() => {
            window.setTimeout(() => onSearchOpenChange?.(false), 120);
          }}
          className="pl-9"
          placeholder="Search buyer (Cmd+K)"
        />
        {searchOpen ? (
          <div
            className={cn(
              'inline-search-overlay absolute left-0 right-0 z-20 overflow-hidden rounded-[12px] border border-cream-300 bg-white shadow-[0_18px_40px_rgba(34,52,43,0.12)]',
              placement === 'below' ? 'top-full mt-2' : 'bottom-full mb-2',
            )}
          >
            <div className="border-b border-cream-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
              {query.trim().length > 0 ? 'Matching buyers' : 'Recent buyers'}
            </div>
            <div className="max-h-[220px] overflow-auto p-2">
              {searchLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-14 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
                  ))}
                </div>
              ) : displayRows.length > 0 ? (
                <div className="space-y-2">
                  {displayRows.map((buyer) => (
                    <button
                      key={buyer.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-[12px] border border-cream-200 bg-cream-50 px-3 py-3 text-left transition hover:border-cream-300 hover:bg-white"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelectBuyer(buyer.id)}
                    >
                      <EntityAvatar initials={initialsForBuyer(buyer.business_name)} hue="teal" size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-medium text-cream-950">{buyer.business_name}</p>
                        <p className="truncate text-xs text-cream-600">{buyer.place_of_supply}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-2 py-6 text-center text-sm text-cream-600">No buyers matched this search.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-xs text-cream-600">Search by buyer name and pick from the inline results.</p>
    </aside>
  );
}

export function BuyerCardFilled({
  buyer,
  previewTotal,
  paymentTermsValue,
  readOnly = false,
  onPaymentTermsChange: _onPaymentTermsChange,
  onChangeBuyer,
  priceListOptions = [],
  selectedPriceListId,
  onPriceListChange,
}: {
  buyer: EstimateComposerBuyerContext;
  previewTotal: number;
  paymentTermsValue: string;
  readOnly?: boolean;
  onPaymentTermsChange?: (value: string) => void;
  onChangeBuyer: () => void;
  priceListOptions?: EstimateComposerPriceListOption[];
  selectedPriceListId?: string | null;
  onPriceListChange?: (value: string | null) => void;
}) {
  void _onPaymentTermsChange;
  const [pricelistChangeMode, setPricelistChangeMode] = useState(false);
  const hasPricelistControl = Boolean(onPriceListChange);
  const { creditEnabled } = useBusinessPolicy();

  const displayPricelistName =
    selectedPriceListId == null
      ? (buyer.active_pricelist?.name ?? 'Base selling price')
      : priceListOptions.find((o) => o.id === selectedPriceListId)?.name ?? buyer.active_pricelist?.name ?? 'Pricelist';

  return (
    <aside className="buyer-card rounded-[14px] border border-cream-300 bg-white p-4">
      <div className="flex items-start gap-3">
        <EntityAvatar initials={initialsForBuyer(buyer.business_name)} hue="teal" size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-md font-semibold text-cream-950">{buyer.business_name}</p>
          <p className="mt-1 truncate font-mono text-xs text-cream-600">{buyer.gstin ?? 'GSTIN not available'}</p>
        </div>
        {!readOnly ? (
          <Button type="button" variant="ghost" size="sm" className="swap gap-2 shrink-0" onClick={onChangeBuyer} aria-label="Change buyer">
            Change
          </Button>
        ) : null}
      </div>

      <div className="mt-4 rounded-[12px] border border-cream-200 bg-cream-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Bill to</p>
        <p className="mt-2 text-sm leading-[1.55] text-cream-800">{buyer.bill_address}</p>
      </div>

      {creditEnabled ? (
        <div className="mt-4">
          <CreditBar used={buyer.credit_used} limit={buyer.credit_limit} preview={previewTotal} />
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Payment terms</p>
        <p className="mt-1 text-sm text-cream-800">{paymentTermsValue}</p>
      </div>

      <div className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Pricelist</p>
            {!readOnly && pricelistChangeMode && hasPricelistControl ? (
              <Select
                value={selectedPriceListId ?? '__base__'}
                onValueChange={(value) => {
                  onPriceListChange?.(value === '__base__' ? null : value);
                  setPricelistChangeMode(false);
                }}
              >
                <SelectTrigger className="mt-2 h-9">
                  <SelectValue placeholder="Select a pricelist" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__base__">Base selling price</SelectItem>
                  {priceListOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="mt-1 text-sm text-cream-800">{displayPricelistName}</p>
            )}
          </div>
          {!readOnly && hasPricelistControl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 px-2 text-xs"
              onClick={() => setPricelistChangeMode((current) => !current)}
              aria-label={pricelistChangeMode ? 'Done changing pricelist' : 'Change pricelist'}
            >
              {pricelistChangeMode ? 'Done' : 'Change'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Sales agent</p>
        <p className="mt-1 text-sm text-cream-800">{buyer.sales_agent_name ?? 'Unassigned'}</p>
      </div>
    </aside>
  );
}

export function BuyerCardLoading() {
  return (
    <aside className="rounded-[14px] border border-cream-300 bg-white p-4" role="status" aria-label="Loading buyer details">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-cream-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-cream-200" />
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
        </div>
      </div>
      <div className="mt-4 h-20 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="mt-4 h-12 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
            <div className="h-3 w-32 animate-pulse rounded bg-cream-200" />
          </div>
        ))}
      </div>
    </aside>
  );
}

const CREDIT_BAR_FILL_CLASS: Record<EstimateComposerCreditTone, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
};

const CREDIT_BAR_PREVIEW_CLASS: Record<EstimateComposerCreditTone, string> = {
  success: 'bg-success-400/85',
  warning: 'bg-warning-400/85',
  danger: 'bg-danger-400/85',
};

export function CreditBar({
  used,
  limit,
  preview,
  compact = false,
}: {
  used: number;
  limit: number | null;
  preview: number;
  compact?: boolean;
}) {
  const usedPct = resolveEstimateComposerCreditUsedPct(used, limit);
  const tone = resolveEstimateComposerCreditTone(used, limit, preview);
  const previewPct = resolveEstimateComposerCreditPreviewPct(used, limit, preview, usedPct);
  const hasLimit = hasEstimateComposerCreditLimit(limit);

  if (!hasLimit) {
    return (
      <div>
        {!compact ? (
          <div className="flex items-center justify-between text-sm text-cream-700">
            <span>Credit headroom</span>
            <span className="font-mono">
              {formatNumberValue(used, 'CURRENCY_EXACT')} / —
            </span>
          </div>
        ) : null}
        <div className={cn('flex w-full overflow-hidden rounded-full bg-cream-200', compact ? 'mt-1 h-1.5' : 'mt-2 h-2')}>
          <div className={cn('h-full w-full shrink-0 rounded-full', CREDIT_BAR_FILL_CLASS[tone])} />
        </div>
        {!compact ? <p className="mt-1 text-xs text-cream-600">No credit limit set</p> : null}
      </div>
    );
  }

  return (
    <div>
      {!compact ? (
        <div className="flex items-center justify-between text-sm text-cream-700">
          <span>Credit headroom</span>
          <span className="font-mono">
            {formatNumberValue(used, 'CURRENCY_EXACT')} / {formatNumberValue(limit, 'CURRENCY_EXACT')}
          </span>
        </div>
      ) : null}
      <div
        className={cn('flex w-full overflow-hidden rounded-full bg-cream-200', compact ? 'mt-1 h-1.5' : 'mt-2 h-2')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(usedPct)}
      >
        <div
          className={cn('h-full shrink-0 rounded-full', CREDIT_BAR_FILL_CLASS[tone])}
          style={{ width: `${usedPct}%` }}
        />
        {previewPct > 0 ? (
          <div
            className={cn('h-full shrink-0 rounded-full', CREDIT_BAR_PREVIEW_CLASS[tone])}
            style={{ width: `${previewPct}%` }}
          />
        ) : null}
      </div>
      {!compact ? <p className="mt-1 text-xs text-cream-600">Available {formatNumberValue(Math.max(limit - used, 0), 'CURRENCY_EXACT')}</p> : null}
    </div>
  );
}

function initialsForBuyer(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
