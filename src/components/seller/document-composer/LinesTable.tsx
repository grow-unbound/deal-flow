'use client';

import { RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { EntityAvatar } from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumberForInput, parseCurrencyDigits } from '@/lib/currency-input';
import { cn, formatInr } from '@/lib/utils';
import type { EstimateComposerLineInput, EstimateComposerProductSearchRow } from '@/types/estimate-composer';

import { ProductSearchDropdown } from './ProductSearchDropdown';

export type LineDiffState = 'clean' | 'added' | 'changed' | 'removed';

export type EstimateComposerLineRow = EstimateComposerLineInput & {
  diff?: LineDiffState;
};

type DocLineKind = 'estimate' | 'so' | 'invoice';

function lineRowClass(line: EstimateComposerLineRow, readOnly: boolean) {
  if (readOnly) return '';
  if (line.diff === 'changed') return 'is-changed';
  if (line.diff === 'added') return 'is-added';
  if (line.diff === 'removed') return 'is-removed';
  return '';
}

function matchesLineFilter(line: EstimateComposerLineRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${line.product_name} ${line.sku} ${line.brand_name}`.toLowerCase();
  return hay.includes(q);
}

export function LinesTable({
  kind = 'estimate',
  buyerSelected,
  lines,
  readOnly = false,
  productQuery,
  productResults,
  searchOpen,
  notesExpanded,
  freightExpanded,
  internalExpanded,
  singleNoteMode = false,
  resetEnabled = false,
  title,
  description,
  showNotesControls = true,
  showFreightControls = true,
  notesValue,
  freightValue,
  internalValue,
  onProductQueryChange,
  onSearchOpenChange,
  onAddProduct,
  onResetOverrides,
  onLineChange,
  onRemoveLine,
  onNotesValueChange,
  onFreightValueChange,
  onInternalValueChange,
  onToggleNotes,
  onToggleFreight,
  onToggleInternal,
}: {
  kind?: DocLineKind;
  buyerSelected: boolean;
  lines: EstimateComposerLineRow[];
  readOnly?: boolean;
  productQuery: string;
  productResults: EstimateComposerProductSearchRow[];
  searchOpen: boolean;
  notesExpanded: boolean;
  freightExpanded: boolean;
  internalExpanded: boolean;
  singleNoteMode?: boolean;
  resetEnabled?: boolean;
  title?: string;
  description?: string;
  showNotesControls?: boolean;
  showFreightControls?: boolean;
  notesValue: string;
  freightValue: string;
  internalValue: string;
  onProductQueryChange: (value: string) => void;
  onSearchOpenChange: (open: boolean) => void;
  onAddProduct: (product: EstimateComposerProductSearchRow) => void;
  onResetOverrides?: () => void;
  onLineChange: (lineId: string, patch: Partial<EstimateComposerLineRow>) => void;
  onRemoveLine: (lineId: string) => void;
  onNotesValueChange: (value: string) => void;
  onFreightValueChange: (value: string) => void;
  onInternalValueChange: (value: string) => void;
  onToggleNotes: () => void;
  onToggleFreight: () => void;
  onToggleInternal: () => void;
}) {
  const activeLines = lines.filter((line) => line.diff !== 'removed');
  const colCount = readOnly ? 7 : 8;
  const bodyLines = readOnly ? activeLines : lines;
  const showDualNotes = !singleNoteMode;
  const topSearchAnchorRef = useRef<HTMLDivElement | null>(null);
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const [lineFilterQuery, setLineFilterQuery] = useState('');
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);

  const visibleLines = useMemo(
    () => bodyLines.filter((line) => matchesLineFilter(line, lineFilterQuery)),
    [bodyLines, lineFilterQuery],
  );

  useEffect(() => {
    setHighlightedProductIndex(0);
  }, [productResults]);

  useEffect(() => {
    if (!searchOpen) setHighlightedProductIndex(0);
  }, [searchOpen]);

  const showBottomProductSearch = !readOnly && buyerSelected;

  const handleProductSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen || productResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedProductIndex((i) => Math.min(i + 1, productResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedProductIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = productResults[highlightedProductIndex];
      if (row) {
        onAddProduct(row);
        onProductQueryChange('');
        onSearchOpenChange(false);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onSearchOpenChange(false);
    }
  };

  const activeDescendantId =
    searchOpen && productResults.length > 0 && highlightedProductIndex >= 0
      ? `${listboxId}-opt-${highlightedProductIndex}`
      : undefined;

  return (
    <section className="doc-lines flex h-full min-h-0 flex-col overflow-visible rounded-[14px] border border-cream-300 bg-white">
      <div className="doc-lines-head flex flex-wrap items-start justify-between gap-3 border-b border-cream-200 px-5 py-4">
        <div>
          <p className="title text-[13px] font-semibold text-cream-950">
            {readOnly
              ? `${activeLines.length} line${activeLines.length === 1 ? '' : 's'}`
              : title ??
                (activeLines.length === 0 ? 'Add your first product' : `${activeLines.length} line${activeLines.length === 1 ? '' : 's'}`)}
          </p>
          <p className="sub mt-1 text-[12px] text-cream-600">
            {readOnly ? 'View only — duplicate or edit to make changes.' : description ?? 'Pricelist auto-applies. Adjust qty, price, or discount as needed.'}
          </p>
        </div>
        {!readOnly ? (
          <div className="ml-auto flex min-w-[200px] max-w-md flex-1 flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
              <Input
                value={lineFilterQuery}
                onChange={(e) => setLineFilterQuery(e.target.value)}
                className="h-9 pl-9 text-[13px]"
                placeholder="Filter lines…"
                aria-label="Filter lines by product, SKU, or brand"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-[12px]"
              disabled={!resetEnabled}
              onClick={onResetOverrides}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset overrides
            </Button>
            {showNotesControls ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-[12px]" onClick={onToggleNotes}>
                {notesExpanded ? 'Hide notes' : 'Notes'}
              </Button>
            ) : null}
            {showFreightControls ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-[12px]" onClick={onToggleFreight}>
                {freightExpanded ? 'Hide freight' : 'Freight charges'}
              </Button>
            ) : null}
            {showDualNotes ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-[12px]" onClick={onToggleInternal}>
                {internalExpanded ? 'Hide internal note' : 'Internal note'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="lines-table w-full min-w-[960px] text-left text-[13px]">
          <thead>
            <tr className="sticky top-0 z-[1] border-b border-cream-200 bg-white text-[11px] font-semibold uppercase tracking-[0.06em] text-cream-500">
              <th className="w-10 px-3 py-2">#</th>
              <th className="px-3 py-2">Product</th>
              <th className="num w-24 px-2 py-2 text-right">Qty</th>
              <th className="num w-24 px-2 py-2 text-right">Base</th>
              <th className="num w-28 px-2 py-2 text-right">Pricelist</th>
              <th className="num w-20 px-2 py-2 text-right">Disc %</th>
              <th className="num w-28 px-2 py-2 text-right">Amount</th>
              {!readOnly ? <th className="w-10 px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {showBottomProductSearch ? (
              <tr className="sticky top-[41px] z-[2] border-b border-cream-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                <td colSpan={colCount} className="p-0">
                  <div ref={topSearchAnchorRef} className="relative px-4 py-3">
                    <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
                    <Input
                      ref={productSearchInputRef}
                      value={productQuery}
                      role="combobox"
                      aria-expanded={searchOpen}
                      aria-controls={listboxId}
                      aria-activedescendant={activeDescendantId}
                      onChange={(event) => {
                        onProductQueryChange(event.target.value);
                        onSearchOpenChange(true);
                      }}
                      onFocus={() => onSearchOpenChange(true)}
                      onBlur={() => {
                        window.setTimeout(() => onSearchOpenChange(false), 120);
                      }}
                      onKeyDown={handleProductSearchKeyDown}
                      className="h-10 pl-10"
                      placeholder="Search product, SKU, or brand to add a line"
                    />
                    <ProductSearchDropdown
                      open={searchOpen}
                      anchorRef={topSearchAnchorRef}
                      results={productResults}
                      highlightedIndex={highlightedProductIndex}
                      onHighlightChange={setHighlightedProductIndex}
                      listboxId={listboxId}
                      onSelect={(row) => {
                        onAddProduct(row);
                        onProductQueryChange('');
                        onSearchOpenChange(false);
                      }}
                    />
                  </div>
                </td>
              </tr>
            ) : null}

            {visibleLines.length === 0 ? (
              <tr className="empty-table-row">
                <td colSpan={colCount} className="px-5 py-8 text-center text-[13px] text-cream-600">
                  {lineFilterQuery.trim()
                    ? 'No lines match your filter.'
                    : buyerSelected
                      ? 'No lines added. Search above to add products.'
                      : 'No lines added.'}
                </td>
              </tr>
            ) : null}

            {visibleLines.map((line, index) => {
              if (!readOnly && line.diff === 'removed') {
                return (
                  <tr key={line.id} className={cn('border-b border-cream-50', lineRowClass(line, readOnly))}>
                    <td className="px-3 py-3 text-cream-400">{index + 1}</td>
                    <td colSpan={colCount - 1} className="px-3 py-3 text-cream-500 line-through">
                      {line.product_name} (removed)
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={line.id} className={cn('border-b border-cream-50', lineRowClass(line, readOnly))}>
                  <td className="px-3 py-3 tabular-nums text-cream-600">{index + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-3">
                      <EntityAvatar initials={line.brand_initials} hue={line.brand_hue} size={32} />
                      <div className="min-w-0">
                        <p className="font-medium text-cream-900">{line.product_name}</p>
                        <p className="text-[11px] text-cream-600">
                          {line.sku}
                          {(line.mrp ?? 0) > 0 ? ` · MRP ${formatInr(line.mrp)}` : ''}
                          {kind === 'estimate' ? ` · Stock ${line.on_hand}` : ''}
                          {line.hsn_code ? ` · HSN ${line.hsn_code}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="num px-2 py-3 text-right">
                    {readOnly ? (
                      <span className="field-value tabular-nums">{formatNumberForInput(line.qty)}</span>
                    ) : (
                      <div className="qty-cell editable inline-flex items-center justify-end">
                        <Input
                          className="h-8 w-[4.5rem] text-right tabular-nums"
                          inputMode="numeric"
                          value={formatNumberForInput(line.qty)}
                          onChange={(event) => {
                            const next = parseCurrencyDigits(event.target.value);
                            if (next <= 0) return;
                            onLineChange(line.id, { qty: next });
                          }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="num px-2 py-3 text-right font-mono text-[12px] tabular-nums text-cream-700">
                    {formatInr(line.base_selling_price ?? 0)}
                  </td>
                  <td className="num px-2 py-3 text-right">
                    {readOnly ? (
                      <span className="field-value font-mono tabular-nums">{formatInr(line.unit_price)}</span>
                    ) : (
                      <div className="editable relative w-full min-w-[5.5rem]">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-cream-500">
                          ₹
                        </span>
                        <Input
                          className="h-8 w-full pl-6 text-right font-mono text-[12px] tabular-nums"
                          inputMode="numeric"
                          value={formatNumberForInput(line.unit_price)}
                          onChange={(event) => {
                            const next = parseCurrencyDigits(event.target.value);
                            onLineChange(line.id, { unit_price: next });
                          }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="num px-2 py-3 text-right">
                    {readOnly ? (
                      <span className="field-value tabular-nums">{line.disc_pct}%</span>
                    ) : (
                      <Input
                        className="editable h-8 text-right tabular-nums"
                        value={String(line.disc_pct)}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isFinite(next) || next < 0 || next > 100) return;
                          onLineChange(line.id, { disc_pct: next });
                        }}
                      />
                    )}
                  </td>
                  <td className="num-display px-2 py-3 text-right font-mono text-[12.5px] tabular-nums text-cream-900">
                    {formatInr(line.line_total)}
                  </td>
                  {!readOnly ? (
                    <td className="px-2 py-3 text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-cream-500" onClick={() => onRemoveLine(line.id)} aria-label="Remove line">
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>

      {!readOnly && showNotesControls && notesExpanded ? (
        <div className="border-t border-cream-100 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">
            {singleNoteMode ? 'Notes' : 'Notes for buyer'}
          </p>
          <textarea
            className="mt-2 w-full rounded-[10px] border border-cream-300 p-3 text-[13px]"
            rows={3}
            value={notesValue}
            onChange={(event) => onNotesValueChange(event.target.value)}
          />
        </div>
      ) : null}
      {!readOnly && showFreightControls && freightExpanded ? (
        <div className="border-t border-cream-100 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Freight & packing (₹)</p>
          <Input className="mt-2 h-9 max-w-xs" value={freightValue} onChange={(event) => onFreightValueChange(event.target.value)} type="number" />
        </div>
      ) : null}
      {!readOnly && showDualNotes && internalExpanded ? (
        <div className="border-t border-cream-100 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Internal note</p>
          <textarea
            className="mt-2 w-full rounded-[10px] border border-cream-300 p-3 text-[13px]"
            rows={2}
            value={internalValue}
            onChange={(event) => onInternalValueChange(event.target.value)}
          />
        </div>
      ) : null}
    </section>
  );
}
