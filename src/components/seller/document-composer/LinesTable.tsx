'use client';

import { RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { EntityAvatar } from '@/components/seller/layout';
import { ScrollableTableShell } from '@/components/seller/layout/ScrollableTableShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumberInput, parseNumberInput } from '@/lib/number-format';
import { cn, formatNumberValue } from '@/lib/utils';
import type { EstimateComposerLineInput, EstimateComposerProductSearchRow } from '@/types/estimate-composer';

import { ProductSearchDropdown } from './ProductSearchDropdown';

export type LineDiffState = 'clean' | 'added' | 'changed' | 'removed';

export type EstimateComposerLineRow = EstimateComposerLineInput & {
  diff?: LineDiffState;
};

type DocLineKind = 'estimate' | 'so' | 'invoice';

function lineRowClass(line: EstimateComposerLineRow, readOnly: boolean, highlightStock = true) {
  const stock = readOnly && highlightStock ? stockStatusForLine(line) : null;
  if (stock?.tone === 'danger') return 'doc-line-stock-danger';
  if (stock?.tone === 'warning') return 'doc-line-stock-warning';
  if (readOnly) return '';
  if (line.diff === 'changed') return 'is-changed';
  if (line.diff === 'added') return 'is-added';
  if (line.diff === 'removed') return 'is-removed';
  return '';
}

function stockStatusForLine(line: EstimateComposerLineRow): { label: string; tone: 'warning' | 'danger' } | null {
  if (!Number.isFinite(line.on_hand)) return null;
  if (line.on_hand <= 0) return { label: 'Out of stock', tone: 'danger' };
  if (line.qty > line.on_hand) return { label: `Short by ${formatNumberInput(line.qty - line.on_hand, 'COUNT')}`, tone: 'warning' };
  return null;
}

function matchesLineFilter(line: EstimateComposerLineRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${line.product_name} ${line.sku} ${line.brand_name}`.toLowerCase();
  return hay.includes(q);
}

function productInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'PR';
}

export function LinesTable({
  kind = 'estimate',
  buyerSelected,
  lines,
  readOnly = false,
  productQuery,
  productResults,
  searchOpen,
  productSearchLoading = false,
  productSearchFetchingNextPage = false,
  productSearchHasMore = false,
  onProductSearchLoadMore,
  notesExpanded,
  freightExpanded,
  internalExpanded,
  singleNoteMode = false,
  resetEnabled = false,
  title,
  description,
  autoFocusLineId,
  onAutoFocusHandled,
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
  productSearchLoading?: boolean;
  productSearchFetchingNextPage?: boolean;
  productSearchHasMore?: boolean;
  onProductSearchLoadMore?: () => void;
  notesExpanded: boolean;
  freightExpanded: boolean;
  internalExpanded: boolean;
  singleNoteMode?: boolean;
  resetEnabled?: boolean;
  title?: string;
  description?: string;
  autoFocusLineId?: string | null;
  onAutoFocusHandled?: () => void;
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
  const activeUnits = activeLines.reduce((sum, line) => sum + line.qty, 0);
  const colCount = readOnly ? 5 : 6;
  const bodyLines = readOnly ? activeLines : lines;
  const showDualNotes = !singleNoteMode;
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
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

  useEffect(() => {
    if (!autoFocusLineId || readOnly) return;
    const input = quantityInputRefs.current[autoFocusLineId];
    if (!input) return;
    input.focus();
    input.select();
    onAutoFocusHandled?.();
  }, [autoFocusLineId, onAutoFocusHandled, readOnly, visibleLines]);

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
      <div className="doc-lines-head flex flex-wrap items-start justify-between gap-3 border-b border-cream-200 px-4 py-3">
        <div>
          <p className="title text-base font-semibold text-cream-950">
            {readOnly
              ? `${activeLines.length} item${activeLines.length === 1 ? '' : 's'}. ${formatNumberInput(activeUnits, 'COUNT')} unit${activeUnits === 1 ? '' : 's'}`
              : title ??
                (activeLines.length === 0 ? 'Add your first product' : `${activeLines.length} line${activeLines.length === 1 ? '' : 's'}`)}
          </p>
          {!readOnly ? (
            <p className="sub mt-1 text-sm text-cream-600">
              {description ?? 'Pricelist auto-applies. Adjust qty, price, or discount as needed.'}
            </p>
          ) : null}
        </div>
        {!readOnly ? (
          <div className="ml-auto flex min-w-[200px] max-w-md flex-1 flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
              <Input
                value={lineFilterQuery}
                onChange={(e) => setLineFilterQuery(e.target.value)}
                className="h-9 pl-9 text-base"
                placeholder="Filter lines…"
                aria-label="Filter lines by product, SKU, or brand"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-sm"
              disabled={!resetEnabled}
              onClick={onResetOverrides}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset overrides
            </Button>
            {showNotesControls ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-sm" onClick={onToggleNotes}>
                {notesExpanded ? 'Hide notes' : 'Notes'}
              </Button>
            ) : null}
            {showFreightControls ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-sm" onClick={onToggleFreight}>
                {freightExpanded ? 'Hide freight' : 'Freight charges'}
              </Button>
            ) : null}
            {showDualNotes ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-sm" onClick={onToggleInternal}>
                {internalExpanded ? 'Hide internal note' : 'Internal note'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <ScrollableTableShell>
          <table className="lines-table w-full table-fixed text-left text-base">
            <colgroup>
              <col className="w-[4.25rem]" />
              <col className="w-[42%]" />
              <col className="w-[5.75rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[6.75rem]" />
              {!readOnly ? <col className="w-8" /> : null}
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-[1] border-b border-cream-200 bg-white">
                <th className="table-label pl-6 pr-5 py-2 text-cream-700">#</th>
                <th className="table-label px-3 py-2 text-cream-700">Product</th>
                <th className="table-label num px-2 py-2 text-right text-cream-700">Quantity</th>
                <th className="table-label num px-2 py-2 text-right text-cream-700">Price/Unit</th>
                <th className="table-label num px-2 pr-6 py-2 text-right text-cream-700">Amount</th>
                {!readOnly ? <th className="table-label pl-1 pr-3 py-2 text-cream-700" /> : null}
              </tr>
            </thead>
          <tbody>
            {showBottomProductSearch ? (
              <tr className="sticky top-[36px] z-[2] border-b border-cream-200 bg-white">
                <td colSpan={colCount} className="p-0">
                  <div className="relative px-4 py-2">
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
                      className="h-9 border-cream-300 pl-10 shadow-none"
                      placeholder="Search product, SKU, or brand to add a line"
                    />
                    <ProductSearchDropdown
                      open={searchOpen}
                      anchorRef={productSearchInputRef}
                      results={productResults}
                      highlightedIndex={highlightedProductIndex}
                      onHighlightChange={setHighlightedProductIndex}
                      listboxId={listboxId}
                      loading={productSearchLoading}
                      isFetchingNextPage={productSearchFetchingNextPage}
                      hasMore={productSearchHasMore}
                      onLoadMore={onProductSearchLoadMore}
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

            {showBottomProductSearch && visibleLines.length > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={colCount} className="h-3 p-0" />
              </tr>
            ) : null}

            {visibleLines.length === 0 ? (
              <tr className="empty-table-row">
                <td colSpan={colCount} className="px-5 py-8 text-center text-base text-cream-600">
                  {lineFilterQuery.trim()
                    ? 'No lines match your filter.'
                    : buyerSelected
                      ? 'No lines added. Search above to add products.'
                      : 'No lines added.'}
                </td>
              </tr>
            ) : null}

            {visibleLines.map((line, index) => {
              const stockStatus = readOnly && kind !== 'invoice' ? stockStatusForLine(line) : null;
              if (!readOnly && line.diff === 'removed') {
                return (
                  <tr key={line.id} className={cn('border-b border-cream-50', lineRowClass(line, readOnly))}>
                    <td className="pl-6 pr-5 py-3 text-cream-400">{index + 1}</td>
                    <td colSpan={colCount - 1} className="px-3 py-3 text-cream-500 line-through">
                      {line.product_name} (removed)
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={line.id} className={cn('border-b border-cream-50', lineRowClass(line, readOnly, kind !== 'invoice'))}>
                  <td className="pl-6 pr-5 py-3 tabular-nums text-cream-600">{index + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-3">
                      <EntityAvatar initials={line.brand_initials || productInitials(line.product_name)} hue={line.brand_hue} imageUrl={line.image_url} size={32} />
                      <div className="min-w-0 w-full">
                        <p className="truncate font-medium text-cream-900" title={line.product_name}>{line.product_name}</p>
                        <p className="truncate text-xs text-cream-600">
                          {line.sku}
                          {(line.mrp ?? 0) > 0 ? ` · MRP ${formatNumberValue(line.mrp, 'CURRENCY_EXACT')}` : ''}
                          {kind === 'estimate' ? ` · Stock ${line.on_hand}` : ''}
                          {line.base_selling_price != null ? ` · Base Price ${formatNumberValue(line.base_selling_price, 'CURRENCY_EXACT')}` : ''}
                        </p>
                        {stockStatus ? (
                          <p className={cn('mt-1 text-xs font-semibold', stockStatus.tone === 'danger' ? 'text-danger-700' : 'text-amber-800')}>
                            {stockStatus.label} · Required {formatNumberInput(line.qty, 'COUNT')}, on hand {formatNumberInput(Math.max(line.on_hand, 0), 'COUNT')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="num px-2 py-3 text-right">
                    {readOnly ? (
                      <span className="field-value tabular-nums">{formatNumberInput(line.qty, 'COUNT')}</span>
                    ) : (
                      <div className="qty-cell editable inline-flex items-center justify-end">
                        <Input
                          ref={(node) => {
                            quantityInputRefs.current[line.id] = node;
                          }}
                          className="h-8 w-[4.5rem] text-right tabular-nums"
                          inputMode="numeric"
                          value={formatNumberInput(line.qty, 'COUNT')}
                          onChange={(event) => {
                            const next = parseNumberInput(event.target.value, 'COUNT') ?? 0;
                            if (next <= 0) return;
                            onLineChange(line.id, { qty: next });
                          }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="num px-2 py-3 text-right">
                    {readOnly ? (
                      <span className="field-value font-mono tabular-nums">{formatNumberValue(line.unit_price ?? line.base_selling_price ?? 0, 'CURRENCY_EXACT')}</span>
                    ) : (
                      <span className="field-value font-mono tabular-nums">{formatNumberValue(line.unit_price ?? line.base_selling_price ?? 0, 'CURRENCY_EXACT')}</span>
                    )}
                  </td>
                  <td className="num-display px-2 pr-6 py-3 text-right font-mono tabular-nums text-cream-900">
                    {formatNumberValue(line.line_total, 'CURRENCY_EXACT')}
                  </td>
                  {!readOnly ? (
                    <td className="pl-1 pr-3 py-3 text-right">
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
        </ScrollableTableShell>
      </div>

      {!readOnly && showNotesControls && notesExpanded ? (
        <div className="border-t border-cream-100 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
            {singleNoteMode ? 'Notes' : 'Notes for buyer'}
          </p>
          <textarea
            className="mt-2 w-full rounded-[10px] border border-cream-300 p-3 text-base"
            rows={3}
            value={notesValue}
            onChange={(event) => onNotesValueChange(event.target.value)}
          />
        </div>
      ) : null}
      {!readOnly && showFreightControls && freightExpanded ? (
        <div className="border-t border-cream-100 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Freight & packing (₹)</p>
          <Input className="mt-2 h-9 max-w-xs" value={freightValue} onChange={(event) => onFreightValueChange(event.target.value)} type="number" />
        </div>
      ) : null}
      {!readOnly && showDualNotes && internalExpanded ? (
        <div className="border-t border-cream-100 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Internal note</p>
          <textarea
            className="mt-2 w-full rounded-[10px] border border-cream-300 p-3 text-base"
            rows={2}
            value={internalValue}
            onChange={(event) => onInternalValueChange(event.target.value)}
          />
        </div>
      ) : null}
    </section>
  );
}
