'use client';

import { Search, Shuffle } from 'lucide-react';

import { EntityAvatar } from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EstimateComposerBuyerContext } from '@/types/estimate-composer';
import { cn, formatCompactInr } from '@/lib/utils';

type BuyerCardEmptyRow = Pick<
  EstimateComposerBuyerContext,
  'id' | 'business_name' | 'place_of_supply' | 'credit_used'
>;

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

  return (
    <aside className="rounded-[14px] border border-cream-300 bg-white p-4">
      <p className="text-[13px] font-semibold text-cream-950">Buyer</p>
      <p className="mt-1 text-[12px] leading-[1.55] text-cream-700">Pick a buyer to start pricing and credit checks.</p>
      <div className="relative mt-4">
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
          <div className="inline-search-overlay absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[12px] border border-cream-300 bg-white shadow-[0_18px_40px_rgba(34,52,43,0.12)]">
            <div className="border-b border-cream-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">
              {query.trim().length > 0 ? 'Matching buyers' : 'Recent buyers'}
            </div>
            <div className="max-h-72 overflow-auto p-2">
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
                        <p className="truncate text-[13px] font-medium text-cream-950">{buyer.business_name}</p>
                        <p className="truncate text-[11px] text-cream-600">
                          {buyer.place_of_supply} · Outstanding {formatCompactInr(buyer.credit_used)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-2 py-6 text-center text-[12px] text-cream-600">No buyers matched this search.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-[11px] text-cream-600">Search by buyer name and pick from the inline results.</p>
    </aside>
  );
}

export function BuyerCardFilled({
  buyer,
  previewTotal,
  paymentTermsValue,
  readOnly = false,
  onPaymentTermsChange,
  onSwap,
}: {
  buyer: EstimateComposerBuyerContext;
  previewTotal: number;
  paymentTermsValue: string;
  readOnly?: boolean;
  onPaymentTermsChange?: (value: string) => void;
  onSwap: () => void;
}) {
  return (
    <aside className="buyer-card rounded-[14px] border border-cream-300 bg-white p-4">
      <div className="flex items-start gap-3">
        <EntityAvatar initials={initialsForBuyer(buyer.business_name)} hue="teal" size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-cream-950">{buyer.business_name}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-cream-600">{buyer.gstin ?? 'GSTIN not available'}</p>
        </div>
        {!readOnly ? (
          <Button type="button" variant="ghost" size="sm" className="swap gap-2" onClick={onSwap}>
            <Shuffle className="h-4 w-4" />
            Swap
          </Button>
        ) : null}
      </div>

      <div className="mt-4 rounded-[12px] border border-cream-200 bg-cream-50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Bill to</p>
        <p className="mt-2 text-[12px] leading-[1.55] text-cream-800">{buyer.bill_address}</p>
      </div>

      <div className="mt-4">
        <CreditBar
          used={buyer.credit_used}
          limit={buyer.credit_limit}
          preview={previewTotal}
        />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Pricelist</p>
          <p className="mt-1 text-[12px] text-cream-800">{buyer.active_pricelist?.name ?? 'Base selling price'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Sales agent</p>
          <p className="mt-1 text-[12px] text-cream-800">{buyer.sales_agent_name ?? 'Unassigned'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Payment terms</p>
          <p className="mt-1 text-[12px] text-cream-800">{paymentTermsValue}</p>
        </div>
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

export function CreditBar({
  used,
  limit,
  preview,
}: {
  used: number;
  limit: number;
  preview: number;
}) {
  const safeLimit = Math.max(limit, 1);
  const usedPct = Math.min((used / safeLimit) * 100, 100);
  const previewPctRaw = ((used + preview) / safeLimit) * 100;
  const previewPct = Math.min(previewPctRaw, 100);
  const tone = previewPctRaw > 100 ? 'danger' : previewPctRaw >= 80 ? 'warning' : 'success';

  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-cream-700">
        <span>Credit headroom</span>
        <span className="font-mono">
          {formatCompactInr(used)} / {formatCompactInr(limit)}
        </span>
      </div>
      <div className="credit-bar mt-2 h-2 overflow-hidden rounded-full bg-cream-200">
        <div className="relative h-full">
        <div className={cn('h-full rounded-full credit-bar__used', `credit-bar__used--${tone}`)} style={{ width: `${usedPct}%` }} />
        <div
          className={cn('credit-bar__preview absolute h-2 rounded-full', `credit-bar__preview--${tone}`)}
          style={{ width: `${Math.max(previewPct - usedPct, 0)}%`, marginLeft: `${usedPct}%` }}
        />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-cream-600">Available {formatCompactInr(Math.max(limit - used, 0))}</p>
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
