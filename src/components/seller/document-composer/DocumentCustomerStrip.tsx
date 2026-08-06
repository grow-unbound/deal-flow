'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusinessPolicy } from '@/hooks/useBusinessPolicy';
import { formatNumberValue } from '@/lib/utils';
import type { EstimateComposerBuyerContext, EstimateComposerPriceListOption } from '@/types/estimate-composer';

function displayPricelistName(
  buyer: EstimateComposerBuyerContext,
  selectedPriceListId?: string | null,
  priceListOptions: EstimateComposerPriceListOption[] = [],
) {
  if (selectedPriceListId == null) {
    return buyer.active_pricelist?.name ?? 'Base selling price';
  }
  return priceListOptions.find((option) => option.id === selectedPriceListId)?.name
    ?? buyer.active_pricelist?.name
    ?? 'Pricelist';
}

function creditUtilizationLabel(buyer: EstimateComposerBuyerContext) {
  const used = formatNumberValue(Math.max(buyer.credit_used, 0), 'CURRENCY_EXACT');
  if (buyer.credit_limit == null || buyer.credit_limit <= 0) {
    return `${used} utilized. No limit set`;
  }
  return `${used} utilized of ${formatNumberValue(buyer.credit_limit, 'CURRENCY_EXACT')} limit`;
}

function StripField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">{label}</p>
      <div className="mt-2 min-h-[2.5rem]">{children}</div>
    </div>
  );
}

export function DocumentCustomerStrip({
  buyer,
  paymentTermsValue,
  mode = 'view',
  placeOfSupplyValue,
  onPlaceOfSupplyChange,
  placeOfSupplyReadOnly = false,
  priceListOptions = [],
  selectedPriceListId,
  onPriceListChange,
  onChangeBuyer,
}: {
  buyer: EstimateComposerBuyerContext | null;
  previewTotal: number;
  paymentTermsValue: string;
  mode?: 'view' | 'edit';
  placeOfSupplyValue?: string;
  onPlaceOfSupplyChange?: (value: string) => void;
  placeOfSupplyReadOnly?: boolean;
  priceListOptions?: EstimateComposerPriceListOption[];
  selectedPriceListId?: string | null;
  onPriceListChange?: (value: string | null) => void;
  onChangeBuyer?: () => void;
}) {
  const { creditEnabled } = useBusinessPolicy();

  if (!buyer) {
    return (
      <section className="rounded-[14px] border border-cream-300 bg-white px-4 py-4">
        <p className="text-base text-cream-700">No buyer assigned.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
      <StripField label="Customer" className="border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-base font-semibold text-cream-950" title={buyer.business_name}>{buyer.business_name}</p>
          {mode === 'edit' && onChangeBuyer ? (
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-ember-700 hover:text-ember-800"
              onClick={onChangeBuyer}
            >
              Change
            </button>
          ) : null}
        </div>
        <p className="mt-1 truncate font-mono text-xs text-cream-600">{buyer.gstin ?? 'GSTIN not available'}</p>
      </StripField>

      <StripField label="Payment terms" className="border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r">
        <p className="text-base font-medium text-cream-950">{paymentTermsValue}</p>
      </StripField>

      <StripField label="Pricelist" className="border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r">
        {mode === 'edit' && onPriceListChange ? (
          <Select
            value={selectedPriceListId ?? '__base__'}
            onValueChange={(value) => onPriceListChange(value === '__base__' ? null : value)}
          >
            <SelectTrigger className="h-auto border-0 bg-transparent px-0 py-0 text-base font-medium text-cream-950 shadow-none focus:ring-0">
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
          <p className="truncate text-base font-medium text-cream-950" title={displayPricelistName(buyer, selectedPriceListId, priceListOptions)}>
            {displayPricelistName(buyer, selectedPriceListId, priceListOptions)}
          </p>
        )}
      </StripField>

      <StripField label="Credit headroom" className="border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r">
        {creditEnabled ? (
          <p className="text-base font-medium leading-snug text-cream-950">{creditUtilizationLabel(buyer)}</p>
        ) : (
          <p className="text-base font-medium text-cream-950">Not tracked</p>
        )}
      </StripField>

      <StripField label="Place of supply" className="border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0">
        {mode === 'edit' ? (
          <Input
            value={placeOfSupplyValue ?? buyer.place_of_supply ?? ''}
            onChange={(event) => onPlaceOfSupplyChange?.(event.target.value)}
            className="h-auto border-0 bg-transparent px-0 py-0 text-base font-medium text-cream-950 shadow-none placeholder:text-cream-600 focus-visible:ring-0"
            placeholder="Enter place of supply"
            readOnly={placeOfSupplyReadOnly}
            disabled={placeOfSupplyReadOnly}
          />
        ) : (
          <p className="truncate text-base font-medium text-cream-950" title={placeOfSupplyValue ?? buyer.place_of_supply ?? '—'}>
            {placeOfSupplyValue ?? buyer.place_of_supply ?? '—'}
          </p>
        )}
      </StripField>
    </section>
  );
}
