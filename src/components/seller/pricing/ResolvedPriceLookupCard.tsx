'use client';

import { useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useResolvedPrice } from '@/hooks/useResolvedPrice';
import { formatNumberValue } from '@/lib/utils';

interface ProductOption {
  id: string;
  label: string;
  meta?: string | null;
}

export function ResolvedPriceLookupCard({
  buyerId,
  productOptions,
  title = 'Price lookup',
  description = 'Verify the resolved price for the selected buyer, product, and quantity.',
}: {
  buyerId: string | null;
  productOptions: ProductOption[];
  title?: string;
  description?: string;
}) {
  const stableOptions = useMemo(() => productOptions.filter((option) => option.id), [productOptions]);
  const [selectedProductId, setSelectedProductId] = useState<string>(stableOptions[0]?.id ?? '');
  const [qty, setQty] = useState<string>('1');

  useEffect(() => {
    if (!stableOptions.length) {
      setSelectedProductId('');
      return;
    }
    if (!stableOptions.some((option) => option.id === selectedProductId)) {
      setSelectedProductId(stableOptions[0]?.id ?? '');
    }
  }, [selectedProductId, stableOptions]);

  const parsedQty = Math.max(1, Number.parseInt(qty || '1', 10) || 1);
  const priceQuery = useResolvedPrice(selectedProductId || null, buyerId, parsedQty);
  const selectedMeta = stableOptions.find((option) => option.id === selectedProductId)?.meta;

  return (
    <section className="rounded-[14px] border border-cream-300 bg-white p-4">
      <div>
        <h3 className="font-display text-lg text-cream-950">{title}</h3>
        <p className="mt-1 text-sm text-cream-700">{description}</p>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Product</p>
          <Select
            value={selectedProductId}
            onValueChange={setSelectedProductId}
            disabled={!buyerId || stableOptions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={!buyerId ? 'Select a buyer first' : 'Select a product'} />
            </SelectTrigger>
            <SelectContent>
              {stableOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMeta ? <p className="text-xs text-cream-600">{selectedMeta}</p> : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Quantity</p>
          <Input
            value={qty}
            onChange={(event) => setQty(event.target.value.replace(/\D/g, '') || '1')}
            inputMode="numeric"
            disabled={!buyerId || !selectedProductId}
          />
        </div>

        <div className="rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Resolved price</p>
          <p className="mt-2 font-display text-2xl text-cream-950">
            {!buyerId || !selectedProductId
              ? '—'
              : priceQuery.isLoading
                ? 'Loading…'
                : formatNumberValue(priceQuery.data?.price ?? 0, 'CURRENCY_EXACT')}
          </p>
          <p className="mt-1 text-xs text-cream-600">Informational only. This does not override document pricing.</p>
        </div>
      </div>
    </section>
  );
}
