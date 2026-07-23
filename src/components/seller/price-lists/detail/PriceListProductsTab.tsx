'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar, LandingTable, type FilterBarGroup } from '@/components/seller/layout';
import {
  MemberToggle,
  MembershipBulkActionBar,
  ProductImageCell,
  RowSelectCheckbox,
  SelectableRow,
  SelectAllCheckbox,
  TableBodySkeleton,
  useSelectableRows,
} from '@/components/seller/shared/SelectableMembershipTable';
import type { PriceListItem } from '@/hooks/usePriceLists';
import { useUpdatePriceListItem } from '@/hooks/usePriceLists';
import { useDebounce } from '@/hooks/useDebounce';
import { detailRowsTotal, flattenDetailRows, usePriceListProductsDetail } from '@/hooks/useDetailTabSearch';
import type { PriceListFilterState, PriceListPricingStrategy } from '@/lib/zod';
import { cn, formatNumberInput, formatNumberValue, parseNumberInput } from '@/lib/utils';

type SortOption =
  | 'Product (A → Z)'
  | 'Brand (A → Z)'
  | 'List price (high → low)'
  | 'Discount % (high → low)'
  | 'Margin % (high → low)';

export interface PriceListProductsTabProps {
  priceListId: string;
  filters: PriceListFilterState | null | undefined;
  items: PriceListItem[];
  brandsCovered: number;
  canViewFinancials?: boolean;
  pricingStrategy?: PriceListPricingStrategy;
  strategyValue?: number | null;
}

const MEMBER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'all', label: 'All' },
];

const STOCK_OPTIONS = [
  { value: 'new_stock', label: 'New stock' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

function renderFilterValues(values: string[]) {
  return values.length > 0 ? values.join(', ') : '—';
}

function strategyPrice(base: number, strategy: PriceListPricingStrategy, value: number | null | undefined) {
  if (strategy === 'percentage') return Math.max(base * (1 - Number(value ?? 0) / 100), 0);
  if (strategy === 'flat_off_base') return Math.max(base - Number(value ?? 0), 0);
  return null;
}

function stockLabel(value: number | null | undefined) {
  return formatNumberValue(Number(value ?? 0), 'COUNT');
}

export function PriceListProductsTab({
  priceListId,
  filters,
  items,
  brandsCovered,
  canViewFinancials = true,
  pricingStrategy = 'edit_each',
  strategyValue = null,
}: PriceListProductsTabProps) {
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('yes');
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stock, setStock] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('Product (A → Z)');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const sort = sortBy === 'Brand (A → Z)' ? 'brand_asc' : sortBy === 'List price (high → low)' ? 'list_desc' : sortBy === 'Discount % (high → low)' ? 'discount_desc' : sortBy === 'Margin % (high → low)' ? 'margin_desc' : 'product_asc';
  const result = usePriceListProductsDetail(priceListId, {
    query: debouncedSearch,
    sort,
    params: { member, brand: brands, category: categories, stock },
  });
  const rows = useMemo(() => flattenDetailRows(result.data), [result.data]);
  const selection = useSelectableRows(rows, (row) => row.tenant_product_id);
  const updateItem = useUpdatePriceListItem(priceListId);
  const isInitialLoading = !result.data && result.isLoading;
  const isInterim = search.trim() !== debouncedSearch.trim() || result.isFetching;

  useEffect(() => {
    selection.clearSelection();
  }, [member, brands, categories, stock, debouncedSearch, sort, selection.clearSelection]);

  const brandOptions = useMemo(() => {
    const labels = new Set([...(filters?.brand_names ?? []), ...rows.map((row) => row.brand_name).filter(Boolean)]);
    return Array.from(labels).sort().map((label) => ({ value: label, label }));
  }, [filters?.brand_names, rows]);
  const categoryOptions = useMemo(() => {
    const labels = new Set([...(filters?.category_names ?? []), ...rows.map((row) => row.category_name).filter(Boolean)]);
    return Array.from(labels).sort().map((label) => ({ value: label, label }));
  }, [filters?.category_names, rows]);

  const filterGroups: FilterBarGroup[] = [
    { key: 'member', label: 'Member', options: MEMBER_OPTIONS, values: [member], onChange: (values) => setMember(values.at(-1) ?? 'all') },
    { key: 'brand', label: 'Brand', options: brandOptions, values: brands, onChange: setBrands },
    { key: 'category', label: 'Category', options: categoryOptions, values: categories, onChange: setCategories },
    { key: 'stock', label: 'Stock status', options: STOCK_OPTIONS, values: stock, onChange: setStock },
  ];

  function beginEdit(row: (typeof rows)[number]) {
    if (!row.item_id || row.list_price == null) return;
    setEditingId(row.item_id);
    setDraftPrice(formatNumberInput(row.list_price, 'CURRENCY_EXACT'));
  }

  async function saveEdit(row: (typeof rows)[number]) {
    if (!row.item_id) return;
    const parsed = parseNumberInput(draftPrice, 'CURRENCY_EXACT');
    if (parsed == null || parsed <= 0) return;

    const derived = strategyPrice(Number(row.base_price ?? 0), pricingStrategy, strategyValue);
    if (derived != null && Math.abs(derived - parsed) > 0.004) {
      const confirmed = window.confirm('This list price differs from the price list strategy. Save it as a row-level override?');
      if (!confirmed) return;
    }

    await updateItem.mutateAsync({ itemId: row.item_id, price: parsed });
    setEditingId(null);
    setDraftPrice('');
  }

  const hasSavedFilters = (filters?.brand_names?.length ?? 0) > 0 || (filters?.category_names?.length ?? 0) > 0;

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Filters applied</h3>
            <p className="mt-1 text-base text-cream-700">
              {detailRowsTotal(result.data) || items.length} products across {brandsCovered} brands.
            </p>
          </div>
        </div>

        {hasSavedFilters ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Brands</p>
              <p className="mt-1 text-base text-cream-900">{renderFilterValues(filters?.brand_names ?? [])}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Categories</p>
              <p className="mt-1 text-base text-cream-900">{renderFilterValues(filters?.category_names ?? [])}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            No product filters applied. This price list is for specific products only.
          </div>
        )}
      </article>

      <div>
        <MembershipBulkActionBar selectedCount={selection.selectedIds.length} onClear={selection.clearSelection} />
        <FilterBar
          count={`${detailRowsTotal(result.data)} products${isInterim ? ' · Updating' : ''}`}
          searchPlaceholder="Search product, SKU, or brand…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          groups={filterGroups}
          searchValue={search}
          searchLoading={search.trim() !== debouncedSearch.trim()}
          onSearchChange={setSearch}
          sortOptions={[
            'Product (A → Z)',
            'Brand (A → Z)',
            'List price (high → low)',
            'Discount % (high → low)',
            ...(canViewFinancials ? ['Margin % (high → low)'] : []),
          ]}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: <SelectAllCheckbox checked={selection.allSelected} indeterminate={selection.someSelected} onChange={selection.toggleVisible} />, width: 48, className: 'px-5' },
            { label: 'Product Name', width: 340, className: 'px-5' },
            { label: 'Member', width: 150, className: 'px-5' },
            { label: 'MRP', align: 'right', className: 'px-5' },
            { label: 'List Price', width: 230, align: 'right', className: 'px-5' },
            { label: 'Base Rate', align: 'right', className: 'px-5' },
            ...(canViewFinancials ? [
              { label: 'Cost Price', align: 'right' as const, className: 'px-5' },
            ] : []),
            { label: 'Current Stock', align: 'right', className: 'px-5' },
          ]}
          tableMinWidth={canViewFinancials ? 1160 : 980}
          showEmptyState={!isInitialLoading && rows.length === 0}
          emptyState={<div className="py-16 text-center text-sm text-cream-500">No products match these filters.</div>}
        >
          {isInitialLoading ? (
            <TableBodySkeleton columns={canViewFinancials ? 8 : 7} />
          ) : (
            rows.map((row) => {
              const isSelected = selection.selectedIds.includes(row.tenant_product_id);
              const isEditing = editingId === row.item_id;
              return (
                <SelectableRow key={row.tenant_product_id} selected={isSelected}>
                  <td className="px-5 py-3.5"><RowSelectCheckbox checked={isSelected} onChange={() => selection.toggleRow(row.tenant_product_id)} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <ProductImageCell src={row.image_url} alt={row.product_name} />
                      <div className="min-w-0">
                        <p className="ent-name truncate font-medium text-cream-950">{row.product_name}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-cream-600">{row.sku} · {row.brand_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><MemberToggle checked={row.is_member} label={`${row.product_name} membership`} /></td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm text-cream-900">{row.mrp != null ? formatNumberValue(row.mrp, 'CURRENCY_EXACT') : '—'}</td>
                  <td className="group px-5 py-3.5 text-right font-mono font-semibold text-cream-950">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <div className="inline-flex h-9 w-32 items-center rounded-[8px] border border-cream-300 bg-white px-2 focus-within:border-ember-400">
                          <span className="shrink-0 text-cream-600">₹</span>
                          <input
                            value={draftPrice}
                            onChange={(event) => setDraftPrice(formatNumberInput(event.target.value, 'CURRENCY_EXACT'))}
                            inputMode="decimal"
                            className="min-w-0 flex-1 bg-transparent text-right outline-none"
                            aria-label="List price"
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={updateItem.isPending} onClick={() => void saveEdit(row)} aria-label="Save list price">
                          <Save size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={updateItem.isPending} onClick={() => { setEditingId(null); setDraftPrice(''); }} aria-label="Cancel list price edit">
                          <X size={14} />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!row.item_id}
                        onClick={() => beginEdit(row)}
                        className={cn('inline-flex items-center justify-end gap-2 rounded-[8px] text-right', row.item_id && 'hover:text-ember-700')}
                      >
                        {row.list_price != null ? formatNumberValue(row.list_price, 'CURRENCY_EXACT') : '—'}
                        {row.item_id ? <Pencil size={13} className="opacity-0 transition-opacity group-hover:opacity-100" /> : null}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-mono text-sm text-cream-900">{formatNumberValue(row.base_price, 'CURRENCY_EXACT')}</p>
                    <p className={cn('mt-0.5 text-xs', row.discount_pct == null ? 'text-cream-500' : row.discount_pct >= 0 ? 'text-teal-700' : 'text-danger-700')}>
                      {row.discount_pct == null ? '—' : `${row.discount_pct >= 0 ? '-' : '+'}${formatNumberValue(Math.abs(row.discount_pct), 'PERCENTAGE')}`}
                    </p>
                  </td>
                  {canViewFinancials ? (
                    <td className="px-5 py-3.5 text-right">
                      <p className="font-mono text-sm text-cream-900">{row.cost_price != null && row.cost_price > 0 ? formatNumberValue(row.cost_price, 'CURRENCY_EXACT') : '—'}</p>
                      <p className="mt-0.5 text-xs text-cream-600">{row.margin_pct == null ? '—' : formatNumberValue(row.margin_pct, 'PERCENTAGE')}</p>
                    </td>
                  ) : null}
                  <td className="px-5 py-3.5 text-right font-mono text-sm text-cream-900">{stockLabel(row.on_hand)}</td>
                </SelectableRow>
              );
            })
          )}
        </LandingTable>
        {result.hasNextPage ? <button type="button" className="mt-4 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium" disabled={result.isFetchingNextPage} onClick={() => result.fetchNextPage()}>{result.isFetchingNextPage ? 'Loading…' : 'Load more'}</button> : null}
      </div>
    </section>
  );
}
