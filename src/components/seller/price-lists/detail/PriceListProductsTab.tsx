'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { AutomaticProductMembershipPanel } from '@/components/seller/shared/AutomaticMembershipRulesPanel';
import { useAddPriceListItems, useApplyPriceListPricingStrategy, useRemovePriceListItems, useSaveSimplePriceList, useUpdatePriceListItem } from '@/hooks/usePriceLists';
import { useDebounce } from '@/hooks/useDebounce';
import { detailRowsTotal, flattenDetailRows, usePriceListProductsDetail } from '@/hooks/useDetailTabSearch';
import { useDetailTableInfiniteScroll } from '@/hooks/useDetailTableInfiniteScroll';
import { formatStrategySummary } from '@/lib/price-list-strategy';
import type { MembershipMode, PriceListFilterState, PriceListPricingStrategy, PriceListSimplePricingStrategy, ProductMembershipRules } from '@/lib/zod';
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
  productsCovered: number;
  brandsCovered: number;
  canViewFinancials?: boolean;
  pricingStrategy?: PriceListPricingStrategy;
  strategyValue?: number | null;
  membershipMode?: MembershipMode;
  name: string;
  description: string | null;
  validFrom: string | null;
  validTo: string | null;
  priority: number;
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
  productsCovered,
  brandsCovered,
  canViewFinancials = true,
  pricingStrategy = 'edit_each',
  strategyValue = null,
  membershipMode = 'manual',
  name,
  description,
  validFrom,
  validTo,
  priority,
}: PriceListProductsTabProps) {
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('yes');
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stock, setStock] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('Product (A → Z)');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');
  const [pendingOverride, setPendingOverride] = useState<{ itemId: string; price: number } | null>(null);

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
  const addItems = useAddPriceListItems(priceListId);
  const removeItems = useRemovePriceListItems(priceListId);
  const canEditMembership = membershipMode === 'manual';
  const automaticMembershipTooltip =
    'This pricelist gets automatic membership based on the above filter criteria. Update filters to manage membership';
  const isInitialLoading = !result.data && result.isLoading;
  const isInterim = search.trim() !== debouncedSearch.trim() || result.isFetching;
  const { sentinelIndex, sentinelRef } = useDetailTableInfiniteScroll({
    itemCount: rows.length,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    fetchNextPage: () => result.fetchNextPage(),
  });

  // Automatic-mode rule editing (requirement 5). Automatic price lists reuse the legacy
  // `filters` column to store ProductMembershipRules instead of PriceListFilterState.
  const savedRules = (membershipMode === 'automatic' ? (filters as unknown as ProductMembershipRules) : null) ?? { brand_names: [], category_names: [] };
  const [draftRules, setDraftRules] = useState<ProductMembershipRules>(savedRules);
  useEffect(() => {
    setDraftRules(savedRules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListId, filters]);
  const savePriceList = useSaveSimplePriceList(priceListId);
  const rulesDirty = JSON.stringify(draftRules) !== JSON.stringify(savedRules);

  const savedPricingStrategy: PriceListSimplePricingStrategy =
    pricingStrategy === 'flat_off_base' || pricingStrategy === 'percentage' ? pricingStrategy : 'edit_each';
  const [draftPricingStrategy, setDraftPricingStrategy] = useState<PriceListSimplePricingStrategy>(savedPricingStrategy);
  const [draftPricingValue, setDraftPricingValue] = useState<number | null>(strategyValue);
  const [confirmPricingOpen, setConfirmPricingOpen] = useState(false);
  useEffect(() => {
    setDraftPricingStrategy(savedPricingStrategy);
    setDraftPricingValue(strategyValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListId, pricingStrategy, strategyValue]);
  const applyPricing = useApplyPriceListPricingStrategy(priceListId);
  const pricingDirty = draftPricingStrategy !== savedPricingStrategy || draftPricingValue !== strategyValue;

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

  function commitEdit(itemId: string, price: number) {
    updateItem.mutate({ itemId, price });
    setEditingId(null);
    setDraftPrice('');
  }

  function saveEdit(row: (typeof rows)[number]) {
    if (!row.item_id) return;
    const parsed = parseNumberInput(draftPrice, 'CURRENCY_EXACT');
    if (parsed == null || parsed <= 0) return;

    const derived = strategyPrice(Number(row.base_price ?? 0), pricingStrategy, strategyValue);
    if (derived != null && Math.abs(derived - parsed) > 0.004) {
      setPendingOverride({ itemId: row.item_id, price: parsed });
      return;
    }

    commitEdit(row.item_id, parsed);
  }

  return (
    <section className="h-full max-h-[calc(100dvh-var(--topbar-h)-14rem)] space-y-4 overflow-y-auto pt-5">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Pricelist Details</h3>
            <p className="mt-1 text-base text-cream-700">
              {detailRowsTotal(result.data) || productsCovered} products across {brandsCovered} brands.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-[10px] border border-cream-300 bg-cream-50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-cream-800">Pricing mode</label>
              <Select
                value={draftPricingStrategy}
                onValueChange={(value) => {
                  setDraftPricingStrategy(value as PriceListSimplePricingStrategy);
                  if (value === 'edit_each') setDraftPricingValue(null);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select pricing mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edit_each">Manual pricing</SelectItem>
                  <SelectItem value="flat_off_base">Flat ₹ off base rate</SelectItem>
                  <SelectItem value="percentage">% off base rate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draftPricingStrategy !== 'edit_each' ? (
              <div>
                <label className="text-sm font-medium text-cream-800">{draftPricingStrategy === 'percentage' ? '% off' : 'Flat ₹ off'}</label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1"
                  value={draftPricingValue ?? ''}
                  onChange={(event) => setDraftPricingValue(event.target.valueAsNumber || 0)}
                />
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-cream-600">{formatStrategySummary(draftPricingStrategy, draftPricingValue)}</p>
            <div className="flex items-center gap-2">
              {pricingDirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraftPricingStrategy(savedPricingStrategy);
                    setDraftPricingValue(strategyValue);
                  }}
                  disabled={applyPricing.isPending}
                >
                  Discard
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={!pricingDirty || applyPricing.isPending || (draftPricingStrategy !== 'edit_each' && draftPricingValue == null)}
                onClick={() => setConfirmPricingOpen(true)}
              >
                {applyPricing.isPending ? 'Saving…' : 'Save pricing mode'}
              </Button>
            </div>
          </div>
        </div>

        {membershipMode === 'automatic' ? (
          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="filters" className="rounded-[10px] border border-cream-300 bg-cream-50 px-3">
              <AccordionTrigger className="px-0">Automatic filters</AccordionTrigger>
              <AccordionContent className="px-0">
                <div className="space-y-3">
                  <AutomaticProductMembershipPanel rules={draftRules} onRulesChange={(next) => setDraftRules(next)} />
                  <div className="flex items-center justify-end gap-2">
                    {rulesDirty ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDraftRules(savedRules)} disabled={savePriceList.isPending}>
                        Discard
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={!rulesDirty || savePriceList.isPending}
                      onClick={() =>
                        savePriceList.mutate({
                          form_mode: 'simple',
                          name,
                          description: description ?? '',
                          valid_from: validFrom ? new Date(validFrom) : new Date(),
                          valid_to: validTo ? new Date(validTo) : undefined,
                          priority,
                          pricing_strategy: savedPricingStrategy,
                          strategy_value: strategyValue,
                          membership_mode: 'automatic',
                          selected_product_ids: [],
                          rules: draftRules,
                        })
                      }
                    >
                      {savePriceList.isPending ? 'Saving…' : 'Save filters'}
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            This is a targeted price list. Products are managed manually below.
          </div>
        )}
      </article>

      <div>
        <MembershipBulkActionBar
          selectedCount={selection.selectedIds.length}
          onClear={selection.clearSelection}
          isPending={addItems.isPending || removeItems.isPending}
          onInclude={() => {
            const toAdd = rows
              .filter((row) => selection.selectedIds.includes(row.tenant_product_id) && !row.is_member)
              .map((row) => ({ tenant_product_id: row.tenant_product_id, price: Number(row.list_price ?? row.base_price ?? 0) }))
              .filter((row) => row.price > 0);
            if (toAdd.length === 0) return;
            addItems.mutate(toAdd, { onSuccess: () => selection.clearSelection() });
          }}
          onRemove={() => {
            const toRemove = rows
              .filter((row) => selection.selectedIds.includes(row.tenant_product_id) && row.is_member && row.item_id)
              .map((row) => row.item_id as string);
            if (toRemove.length === 0) return;
            removeItems.mutate(toRemove, { onSuccess: () => selection.clearSelection() });
          }}
        />
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
          horizontalScrollOnly
          showEmptyState={!isInitialLoading && rows.length === 0}
          emptyState={<div className="py-16 text-center text-sm text-cream-500">No products match these filters.</div>}
        >
          {isInitialLoading ? (
            <TableBodySkeleton columns={canViewFinancials ? 8 : 7} />
          ) : (
            rows.map((row, index) => {
              const isSelected = selection.selectedIds.includes(row.tenant_product_id);
              const isEditing = editingId === row.item_id;
              const derivedPrice = strategyPrice(Number(row.base_price ?? 0), pricingStrategy, strategyValue);
              const isOverridden = derivedPrice != null && row.list_price != null && Math.abs(derivedPrice - row.list_price) > 0.004;
              return (
                <Fragment key={row.tenant_product_id}>
                {index === sentinelIndex ? (
                  <tr aria-hidden="true" style={{ height: 0 }}>
                    <td colSpan={canViewFinancials ? 8 : 7} className="p-0">
                      <div ref={sentinelRef} />
                    </td>
                  </tr>
                ) : null}
                <SelectableRow selected={isSelected}>
                  <td className="px-3 py-3"><RowSelectCheckbox checked={isSelected} onChange={() => selection.toggleRow(row.tenant_product_id)} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <ProductImageCell src={row.image_url} alt={row.product_name} />
                      <div className="min-w-0">
                        <p className="ent-name truncate font-medium text-cream-950">{row.product_name}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-cream-600">{row.sku} · {row.brand_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <MemberToggle
                      checked={row.is_member}
                      label={`${row.product_name} membership`}
                      disabled={!canEditMembership}
                      disabledReason={!canEditMembership ? automaticMembershipTooltip : undefined}
                      isPending={addItems.isPending || removeItems.isPending}
                      onChange={(next) => {
                        if (next) {
                          const price = Number(row.list_price ?? row.base_price ?? 0);
                          if (price <= 0) return;
                          addItems.mutate([{ tenant_product_id: row.tenant_product_id, price }]);
                          return;
                        }
                        if (row.item_id) removeItems.mutate([row.item_id]);
                      }}
                    />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm text-cream-900">{row.mrp != null ? formatNumberValue(row.mrp, 'CURRENCY_EXACT') : '—'}</td>
                  <td className="group px-3 py-3 text-right font-mono font-semibold text-cream-950">
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
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={updateItem.isPending} onClick={() => saveEdit(row)} aria-label="Save list price">
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
                        title={isOverridden ? 'Row-level override — differs from the pricelist\'s pricing mode' : undefined}
                        className={cn(
                          'inline-flex items-center justify-end gap-2 rounded-[8px] text-right',
                          isOverridden ? 'text-ember-700' : row.item_id && 'hover:text-ember-700',
                        )}
                      >
                        {row.list_price != null ? formatNumberValue(row.list_price, 'CURRENCY_EXACT') : '—'}
                        {row.item_id ? <Pencil size={13} className="opacity-0 transition-opacity group-hover:opacity-100" /> : null}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-mono text-sm text-cream-900">{formatNumberValue(row.base_price, 'CURRENCY_EXACT')}</p>
                    <p className={cn('mt-0.5 text-xs', row.discount_pct == null ? 'text-cream-500' : row.discount_pct >= 0 ? 'text-teal-700' : 'text-danger-700')}>
                      {row.discount_pct == null ? '—' : `${row.discount_pct >= 0 ? '-' : '+'}${formatNumberValue(Math.abs(row.discount_pct), 'PERCENTAGE')}`}
                    </p>
                  </td>
                  {canViewFinancials ? (
                    <td className="px-3 py-3 text-right">
                      <p className="font-mono text-sm text-cream-900">{row.cost_price != null && row.cost_price > 0 ? formatNumberValue(row.cost_price, 'CURRENCY_EXACT') : '—'}</p>
                      <p className="mt-0.5 text-xs text-cream-600">{row.margin_pct == null ? '—' : formatNumberValue(row.margin_pct, 'PERCENTAGE')}</p>
                    </td>
                  ) : null}
                  <td className="px-3 py-3 text-right font-mono text-sm text-cream-900">{stockLabel(row.on_hand)}</td>
                </SelectableRow>
                </Fragment>
              );
            })
          )}
        </LandingTable>
      </div>

      <AlertDialog open={confirmPricingOpen} onOpenChange={setConfirmPricingOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update pricing mode?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the price of {detailRowsTotal(result.data) || productsCovered} products. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyPricing.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={applyPricing.isPending}
              onClick={() => {
                applyPricing.mutate(
                  { pricingStrategy: draftPricingStrategy, strategyValue: draftPricingStrategy === 'edit_each' ? null : draftPricingValue },
                  { onSuccess: () => setConfirmPricingOpen(false) },
                );
              }}
            >
              {applyPricing.isPending ? 'Updating…' : 'Update pricing'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingOverride != null} onOpenChange={(open) => { if (!open) setPendingOverride(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as a row-level override?</AlertDialogTitle>
            <AlertDialogDescription>
              This list price differs from the pricelist&apos;s pricing mode. Save it as a row-level override?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateItem.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateItem.isPending}
              onClick={() => {
                if (pendingOverride) commitEdit(pendingOverride.itemId, pendingOverride.price);
                setPendingOverride(null);
              }}
            >
              {updateItem.isPending ? 'Saving…' : 'Save override'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
