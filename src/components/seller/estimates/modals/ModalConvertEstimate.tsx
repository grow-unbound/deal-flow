'use client';

import { ArrowRightCircle, FileText, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useEstimateProductSearch } from '@/hooks/useEstimates';
import type { EstimateComposerLineInput, EstimateComposerProductSearchRow } from '@/types/estimate-composer';
import { formatCompactInr } from '@/lib/utils';

type Target = 'sales_order' | 'invoice';

interface AddedLine {
  id: string;
  product: EstimateComposerProductSearchRow;
  qty: number;
}

export interface AddedLinePayload {
  tenant_product_id: string;
  qty: number;
  unit_price: number;
  disc_pct: number;
  tax_pct: number;
}

function lineAmount(unit_price: number, qty: number, disc_pct: number, tax_pct: number) {
  const taxable = qty * unit_price * (1 - disc_pct / 100);
  return taxable + taxable * (tax_pct / 100);
}

export function ModalConvertEstimate({
  open,
  onOpenChange,
  estimateNumber,
  buyerName,
  buyerId,
  lines,
  createSalesOrders,
  createInvoices,
  isSubmitting,
  onConfirmSO,
  onConfirmInvoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateNumber: string;
  buyerName: string;
  buyerId?: string | null;
  lines: EstimateComposerLineInput[];
  createSalesOrders: boolean;
  createInvoices: boolean;
  isSubmitting: boolean;
  onConfirmSO: (input: { line_ids: string[]; qty_overrides: Record<string, number>; delivery_date: string; order_number?: string; added_lines?: AddedLinePayload[] }) => void;
  onConfirmInvoice: (input: { line_ids: string[]; qty_overrides: Record<string, number>; invoice_date: string; invoice_number?: string; added_lines?: AddedLinePayload[] }) => void;
}) {
  const defaultTarget: Target = createSalesOrders ? 'sales_order' : 'invoice';
  const [target, setTarget] = useState<Target>(defaultTarget);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, string>>({});
  const [primaryDate, setPrimaryDate] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [addedLines, setAddedLines] = useState<AddedLine[]>([]);
  const [addedQtyOverrides, setAddedQtyOverrides] = useState<Record<string, string>>({});

  // Product search state
  const [productQuery, setProductQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const productSearchResult = useEstimateProductSearch(productQuery, buyerId ?? null, searchOpen);
  const allSearchProducts: EstimateComposerProductSearchRow[] = productSearchResult.data ?? [];

  const existingProductIds = useMemo(
    () => new Set([...lines.map((l) => l.tenant_product_id), ...addedLines.map((al) => al.product.tenant_product_id)]),
    [lines, addedLines],
  );
  const filteredSearchResults = useMemo(
    () => allSearchProducts.filter((p) => !existingProductIds.has(p.tenant_product_id)),
    [allSearchProducts, existingProductIds],
  );

  useEffect(() => {
    if (!open) return;
    setTarget(createSalesOrders ? 'sales_order' : 'invoice');
    const next: Record<string, boolean> = {};
    for (const line of lines) next[line.id] = true;
    setSelected(next);
    setQtyOverrides({});
    setAddedLines([]);
    setAddedQtyOverrides({});
    setProductQuery('');
    setSearchOpen(false);
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setPrimaryDate(d.toISOString().slice(0, 10));
    setDocNumber('');
  }, [open, lines, createSalesOrders]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [searchOpen]);

  function addProduct(product: EstimateComposerProductSearchRow) {
    const id = `added-${product.tenant_product_id}`;
    setAddedLines((prev) => [...prev, { id, product, qty: 1 }]);
    setProductQuery('');
    setSearchOpen(false);
  }

  function removeAddedLine(id: string) {
    setAddedLines((prev) => prev.filter((al) => al.id !== id));
    setAddedQtyOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const existingIncluded = useMemo(() => lines.filter((l) => selected[l.id]), [lines, selected]);

  const total = useMemo(() => {
    const existingTotal = existingIncluded.reduce((sum, l) => {
      const overrideStr = qtyOverrides[l.id];
      const override = overrideStr !== undefined ? parseFloat(overrideStr) : undefined;
      const qty = override && override > 0 ? override : l.qty;
      return sum + lineAmount(l.unit_price, qty, l.disc_pct, l.tax_pct);
    }, 0);
    const addedTotal = addedLines.reduce((sum, al) => {
      const overrideStr = addedQtyOverrides[al.id];
      const override = overrideStr !== undefined ? parseFloat(overrideStr) : undefined;
      const qty = override && override > 0 ? override : al.qty;
      return sum + lineAmount(al.product.unit_price, qty, 0, al.product.tax_pct ?? 0);
    }, 0);
    return existingTotal + addedTotal;
  }, [existingIncluded, qtyOverrides, addedLines, addedQtyOverrides]);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [id]: checked }));
  }

  function handleSubmit() {
    const lineIds = lines.filter((l) => selected[l.id]).map((l) => l.id);
    if (lineIds.length === 0 && addedLines.length === 0) return;
    if (!primaryDate) return;

    const overrides: Record<string, number> = {};
    for (const [id, raw] of Object.entries(qtyOverrides)) {
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0) overrides[id] = n;
    }

    const addedPayload: AddedLinePayload[] = addedLines.map((al) => {
      const overrideStr = addedQtyOverrides[al.id];
      const override = overrideStr !== undefined ? parseFloat(overrideStr) : undefined;
      const qty = override && override > 0 ? override : al.qty;
      return {
        tenant_product_id: al.product.tenant_product_id,
        qty,
        unit_price: al.product.unit_price,
        disc_pct: 0,
        tax_pct: al.product.tax_pct ?? 0,
      };
    });

    if (target === 'sales_order') {
      onConfirmSO({
        line_ids: lineIds,
        qty_overrides: overrides,
        delivery_date: primaryDate,
        order_number: docNumber.trim() || undefined,
        added_lines: addedPayload.length > 0 ? addedPayload : undefined,
      });
    } else {
      onConfirmInvoice({
        line_ids: lineIds,
        qty_overrides: overrides,
        invoice_date: primaryDate,
        invoice_number: docNumber.trim() || undefined,
        added_lines: addedPayload.length > 0 ? addedPayload : undefined,
      });
    }
  }

  const canSubmit = (existingIncluded.length > 0 || addedLines.length > 0) && !!primaryDate && !isSubmitting;
  const confirmLabel = target === 'sales_order' ? 'Create Sales Order' : 'Create Invoice';
  const totalLineCount = existingIncluded.length + addedLines.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] gap-0 p-0 sm:max-w-[640px]">
        <DialogHeader className="border-b border-cream-200 px-6 pb-4 pt-6">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <ArrowRightCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
                From estimate · {estimateNumber}
              </p>
              <DialogTitle className="mt-1 text-left text-lg font-semibold text-cream-950">
                Convert Estimate
              </DialogTitle>
              <p className="mt-2 text-base leading-relaxed text-cream-700">
                Converting for <strong className="font-medium text-cream-900">{buyerName}</strong>. Select lines, add products, adjust quantities, then choose a target.
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 px-6 py-5">
          {/* Target selector */}
          {createSalesOrders && createInvoices && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTarget('sales_order')}
                className={`flex flex-1 items-center gap-2.5 rounded-[10px] border px-4 py-3 text-left transition-colors ${
                  target === 'sales_order'
                    ? 'border-teal-500 bg-teal-50 text-teal-900'
                    : 'border-cream-300 bg-white text-cream-700 hover:border-cream-400'
                }`}
              >
                <ShoppingCart className="h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Sales Order</p>
                  <p className="text-xs text-cream-500">Reserve stock &amp; track dispatch</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTarget('invoice')}
                className={`flex flex-1 items-center gap-2.5 rounded-[10px] border px-4 py-3 text-left transition-colors ${
                  target === 'invoice'
                    ? 'border-teal-500 bg-teal-50 text-teal-900'
                    : 'border-cream-300 bg-white text-cream-700 hover:border-cream-400'
                }`}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Invoice</p>
                  <p className="text-xs text-cream-500">Bill directly without an SO</p>
                </div>
              </button>
            </div>
          )}
          {!createSalesOrders && createInvoices && (
            <div className="flex items-center gap-2 rounded-[10px] border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
              <FileText className="h-4 w-4 shrink-0" />
              Converting directly to an <strong className="font-semibold">Invoice</strong> — Sales Order creation is disabled in settings.
            </div>
          )}
          {createSalesOrders && !createInvoices && (
            <div className="flex items-center gap-2 rounded-[10px] border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
              <ShoppingCart className="h-4 w-4 shrink-0" />
              Converting to a <strong className="font-semibold">Sales Order</strong> — Invoice creation is disabled in settings.
            </div>
          )}

          {/* Line items table */}
          <div className="overflow-hidden rounded-[12px] border border-cream-300">
            <div className="grid grid-cols-[40px_minmax(0,1fr)_80px_80px_96px] gap-2 border-b border-cream-200 bg-cream-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">
              <span />
              <span>Product</span>
              <span className="text-right">Orig. Qty</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Amount</span>
            </div>

            {/* Existing estimate lines */}
            {lines.map((line) => {
              const on = Boolean(selected[line.id]);
              const overrideStr = qtyOverrides[line.id] ?? '';
              const displayQty = overrideStr !== '' ? overrideStr : String(line.qty);
              const parsedQty = parseFloat(displayQty);
              const effectiveQty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : line.qty;
              return (
                <div
                  key={line.id}
                  className={`grid grid-cols-[40px_minmax(0,1fr)_80px_80px_96px] items-center gap-2 border-b border-cream-100 px-3 py-2 last:border-b-0 ${on ? '' : 'opacity-40'}`}
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) => toggle(line.id, v === true)}
                    aria-label={`Include ${line.product_name}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{line.product_name}</p>
                    <p className="truncate font-mono text-xs text-cream-600">{line.sku}</p>
                  </div>
                  <p className="text-right text-sm tabular-nums text-cream-500">{line.qty}</p>
                  <div className="flex justify-end">
                    <Input
                      type="number"
                      min={0.01}
                      step="any"
                      value={displayQty}
                      disabled={!on}
                      onChange={(e) => setQtyOverrides((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      className="h-7 w-[68px] px-2 text-right text-sm tabular-nums"
                    />
                  </div>
                  <p className="text-right font-mono text-base tabular-nums text-cream-900">
                    {on ? formatCompactInr(lineAmount(line.unit_price, effectiveQty, line.disc_pct, line.tax_pct)) : '—'}
                  </p>
                </div>
              );
            })}

            {/* Newly added lines */}
            {addedLines.map((al) => {
              const overrideStr = addedQtyOverrides[al.id] ?? '';
              const displayQty = overrideStr !== '' ? overrideStr : String(al.qty);
              const parsedQty = parseFloat(displayQty);
              const effectiveQty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : al.qty;
              return (
                <div
                  key={al.id}
                  className="grid grid-cols-[40px_minmax(0,1fr)_80px_80px_96px] items-center gap-2 border-b border-cream-100 bg-teal-50/30 px-3 py-2 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => removeAddedLine(al.id)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-cream-400 hover:bg-cream-100 hover:text-cream-700"
                    aria-label="Remove product"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{al.product.product_name}</p>
                    <p className="truncate font-mono text-xs text-cream-600">{al.product.sku}</p>
                  </div>
                  <p className="text-right text-xs tabular-nums text-teal-600">+new</p>
                  <div className="flex justify-end">
                    <Input
                      type="number"
                      min={0.01}
                      step="any"
                      value={displayQty}
                      onChange={(e) => setAddedQtyOverrides((prev) => ({ ...prev, [al.id]: e.target.value }))}
                      className="h-7 w-[68px] px-2 text-right text-sm tabular-nums"
                    />
                  </div>
                  <p className="text-right font-mono text-base tabular-nums text-cream-900">
                    {formatCompactInr(lineAmount(al.product.unit_price, effectiveQty, 0, al.product.tax_pct ?? 0))}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Product search */}
          {buyerId ? (
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
                <Input
                  placeholder="Add a product…"
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  className="h-9 pl-9 pr-3 text-base"
                />
              </div>
              {searchOpen && (productQuery.length > 0 || filteredSearchResults.length > 0) && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[220px] overflow-y-auto rounded-[10px] border border-cream-200 bg-white shadow-lg">
                  {productSearchResult.isLoading ? (
                    <p className="px-3 py-3 text-sm text-cream-500">Searching…</p>
                  ) : filteredSearchResults.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-cream-500">{productQuery ? 'No results' : 'Type to search products'}</p>
                  ) : (
                    filteredSearchResults.map((product) => (
                      <button
                        key={product.tenant_product_id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addProduct(product);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-cream-50"
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-cream-900">{product.product_name}</p>
                          <p className="truncate font-mono text-xs text-cream-500">{product.sku} · {formatCompactInr(product.unit_price)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Date + number */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-cream-800">
                {target === 'sales_order' ? 'Expected delivery' : 'Invoice date'}
              </p>
              <Input
                type="date"
                value={primaryDate}
                onChange={(e) => setPrimaryDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-cream-800">
                {target === 'sales_order' ? 'SO number (optional)' : 'Invoice number (optional)'}
              </p>
              <Input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="h-10 font-mono text-base"
                placeholder="Auto-generate if empty"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="flex items-baseline justify-between rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2.5 text-base">
            <span className="text-cream-700">
              {totalLineCount} line{totalLineCount === 1 ? '' : 's'}
              {addedLines.length > 0 ? <span className="ml-1 text-xs text-teal-600">({addedLines.length} added)</span> : null}
            </span>
            <span className="font-mono font-medium tabular-nums text-cream-900">{formatCompactInr(total)}</span>
          </div>
        </DialogBody>

        <DialogFooter className="border-t border-cream-200 px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <ArrowRightCircle className="h-4 w-4" />
            {isSubmitting ? 'Creating…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
