'use client';

import { Input } from '@/components/ui/input';
import { formatNumberForInput, parseCurrencyDigits } from '@/lib/currency-input';
import { cn } from '@/lib/utils';

export function DocumentMetaCard({
  placeOfSupplyValue,
  notesValue,
  freightValue,
  onPlaceOfSupplyChange,
  onNotesChange,
  onFreightChange,
  readOnly = false,
}: {
  placeOfSupplyValue: string;
  notesValue: string;
  freightValue: number;
  onPlaceOfSupplyChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onFreightChange: (value: number) => void;
  readOnly?: boolean;
}) {
  return (
    <aside className="rounded-[14px] border border-cream-300 bg-white p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Place of supply</p>
        <Input
          className={cn('mt-2 h-10', readOnly && 'bg-cream-50')}
          value={placeOfSupplyValue}
          onChange={(event) => onPlaceOfSupplyChange(event.target.value)}
          placeholder="Enter place of supply"
          readOnly={readOnly}
          disabled={readOnly}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Notes</p>
        <textarea
          className={cn(
            'mt-2 min-h-[96px] w-full rounded-[10px] border border-cream-300 p-3 text-base',
            readOnly && 'cursor-default bg-cream-50 text-cream-800',
          )}
          rows={4}
          value={notesValue}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Add buyer-facing notes"
          readOnly={readOnly}
          disabled={readOnly}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Freight charges</p>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-cream-600">₹</span>
          <Input
            className={cn('h-10 pl-8 font-mono tabular-nums', readOnly && 'bg-cream-50')}
            inputMode="numeric"
            value={freightValue > 0 ? formatNumberForInput(freightValue) : ''}
            onChange={(event) => onFreightChange(parseCurrencyDigits(event.target.value))}
            placeholder="0"
            readOnly={readOnly}
            disabled={readOnly}
          />
        </div>
      </div>
    </aside>
  );
}
