'use client';

import { RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EstimateComposerBuyerContext, EstimateComposerPriceListOption } from '@/types/estimate-composer';

export function InsightsCard({
  buyer,
  expiringSoon,
  priceListOptions = [],
  selectedPriceListId,
  readOnly = false,
  onPriceListChange,
}: {
  buyer: EstimateComposerBuyerContext | null;
  expiringSoon: boolean;
  priceListOptions?: EstimateComposerPriceListOption[];
  selectedPriceListId?: string | null;
  readOnly?: boolean;
  onPriceListChange?: (value: string | null) => void;
}) {
  const creditTone = buyer
    ? buyer.credit_available <= 0
      ? 'Over limit'
      : buyer.credit_available < buyer.credit_limit * 0.2
        ? 'Tight'
        : 'Healthy'
    : 'Healthy';

  return (
    <section className="rounded-[14px] border border-cream-300 bg-white p-4">
      <p className="text-[13px] font-semibold text-cream-950">Insights</p>
      <div className="mt-4 space-y-4 text-[12px] text-cream-700">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span>Pricelist applied</span>
            {!readOnly ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled>
                <RefreshCcw className="h-3.5 w-3.5" />
                Swap
              </Button>
            ) : null}
          </div>
          {readOnly ? (
            <p className="mt-1 text-cream-950">{buyer?.active_pricelist?.name ?? 'Base selling price'}</p>
          ) : (
            <Select
              value={selectedPriceListId ?? '__base__'}
              onValueChange={(value) => onPriceListChange?.(value === '__base__' ? null : value)}
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
          )}
        </div>
        <div>
          <span>Scheme savings</span>
          <p className="mt-1 text-cream-950">No active scheme matched.</p>
        </div>
        <div>
          <span>Credit status</span>
          <p className="mt-1 text-cream-950">{creditTone}</p>
          {buyer ? <p className="mt-1 text-[11px] text-cream-600">Net {buyer.payment_terms_days} days</p> : null}
        </div>
        {expiringSoon ? (
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Validity window is within 3 days of expiry.
          </div>
        ) : null}
      </div>
    </section>
  );
}
