'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FilterBar, LandingTable, type FilterBarGroup } from '@/components/seller/layout';
import { MembershipFilterPanel } from '@/components/seller/shared/MembershipFilterPanel';
import {
  useAddCatalogProduct,
  useRemoveCatalogProduct,
  useSaveSimpleCatalog,
  type CatalogDetailResponse,
} from '@/hooks/useCatalogs';
import { useDebounce } from '@/hooks/useDebounce';
import { detailRowsTotal, flattenDetailRows, useCatalogProductsDetail } from '@/hooks/useDetailTabSearch';
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
import type { ProductMembershipRules } from '@/lib/zod';
import { formatNumberInput, formatNumberValue } from '@/lib/utils';

type SortOption = 'Campaign order' | 'Brand (A → Z)' | 'Campaign Sales (high → low)' | 'Units sold (high → low)';

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

interface CatalogCompositionTabProps {
  catalogId: string;
  summary: CatalogDetailResponse['products_summary'];
  composer?: CatalogDetailResponse['composer'];
  headerName: string;
  heroImageUrl: string | null;
}


function stockLabel(value: number | null | undefined) {
  return formatNumberValue(Number(value ?? 0), 'COUNT');
}

export function CatalogCompositionTab({ catalogId, summary, composer, headerName, heroImageUrl }: CatalogCompositionTabProps) {
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('yes');
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stock, setStock] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('Campaign order');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const sort = sortBy === 'Brand (A → Z)' ? 'brand_asc' : sortBy === 'Campaign Sales (high → low)' ? 'sales_desc' : sortBy === 'Units sold (high → low)' ? 'units_desc' : 'catalog_order';
  const result = useCatalogProductsDetail(catalogId, {
    query: debouncedSearch,
    sort,
    params: { member, brand: brands, category: categories, stock },
  });
  const rows = useMemo(() => flattenDetailRows(result.data), [result.data]);
  const selection = useSelectableRows(rows, (row) => row.tenant_product_id);
  const isInitialLoading = !result.data && result.isLoading;
  const isInterim = search.trim() !== debouncedSearch.trim() || result.isFetching;

  useEffect(() => {
    selection.clearSelection();
  }, [member, brands, categories, stock, debouncedSearch, sort, selection.clearSelection]);

  const addProduct = useAddCatalogProduct(catalogId);
  const removeProduct = useRemoveCatalogProduct(catalogId);
  const productMembershipMode = composer?.product_membership_mode ?? 'manual';

  // Automatic-mode rule editing (requirement 5). Reconstructs the full simple-form payload
  // from the current composer snapshot since the PATCH route validates the whole form, not
  // a partial rules-only update.
  const savedProductRules = composer?.product_rules ?? { brand_names: [], category_names: [] };
  const [draftProductRules, setDraftProductRules] = useState<ProductMembershipRules>(savedProductRules);
  useEffect(() => {
    setDraftProductRules(savedProductRules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId, composer?.product_rules]);
  const saveCatalog = useSaveSimpleCatalog(catalogId);
  const productRulesDirty = JSON.stringify(draftProductRules) !== JSON.stringify(savedProductRules);

  function saveProductRules() {
    if (!composer) return;
    saveCatalog.mutate({
      form_mode: 'simple',
      name: headerName,
      description: composer.description ?? '',
      valid_from: new Date(composer.valid_from),
      valid_to: composer.valid_to ? new Date(composer.valid_to) : undefined,
      buyer_note: composer.message ?? '',
      hero_image_url: heroImageUrl ?? '',
      target_mode: composer.scope_type === 'cohort' ? 'customer_group' : 'individual_buyers',
      target_cohort_id: composer.scope_type === 'cohort' ? composer.cohort_id : null,
      pricing_mode: composer.price_source === 'price_list' ? 'pricelist' : 'individual_prices',
      price_list_id: composer.price_source === 'price_list' ? composer.price_list_id : null,
      buyer_target_mode: composer.buyer_target_mode,
      buyer_rules: composer.buyer_rules,
      product_membership_mode: 'automatic',
      product_rules: draftProductRules,
    });
  }

  const brandOptions = useMemo(() => {
    const labels = new Set([...summary.filters.brand_names, ...rows.map((row) => row.brand_name).filter(Boolean)]);
    return Array.from(labels).sort().map((label) => ({ value: label, label }));
  }, [rows, summary.filters.brand_names]);
  const categoryOptions = useMemo(() => {
    const labels = new Set([...summary.filters.category_names, ...rows.map((row) => row.category_name).filter(Boolean)]);
    return Array.from(labels).sort().map((label) => ({ value: label, label }));
  }, [rows, summary.filters.category_names]);

  const filterGroups: FilterBarGroup[] = [
    { key: 'member', label: 'Member', options: MEMBER_OPTIONS, values: [member], onChange: (values) => setMember(values.at(-1) ?? 'all') },
    { key: 'brand', label: 'Brand', options: brandOptions, values: brands, onChange: setBrands },
    { key: 'category', label: 'Category', options: categoryOptions, values: categories, onChange: setCategories },
    { key: 'stock', label: 'Stock status', options: STOCK_OPTIONS, values: stock, onChange: setStock },
  ];

  function startVisualEdit(row: (typeof rows)[number]) {
    setEditingProductId(row.tenant_product_id);
    setDraftPrice(formatNumberInput(row.override_price ?? row.base_selling_price ?? 0, 'CURRENCY_EXACT'));
  }

  function finishVisualEdit() {
    toast.info('Campaign price updates will be connected in a later pass.');
    setEditingProductId(null);
    setDraftPrice('');
  }

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Filters applied</h3>
            <p className="mt-1 text-base text-cream-700">
              {summary.included_count} products selected across {summary.brands_covered} brands.
            </p>
          </div>
          <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">In stock</p>
            <p className="mt-1 font-display text-2xl leading-none text-cream-950">{summary.in_stock_count}</p>
          </div>
        </div>

        {productMembershipMode === 'automatic' ? (
          <div className="mt-4 space-y-3 rounded-[10px] border border-cream-300 bg-cream-50 p-3">
            <MembershipFilterPanel entityType="campaign_products" rules={draftProductRules} onRulesChange={(next) => setDraftProductRules(next as ProductMembershipRules)} />
            <div className="flex items-center justify-end gap-2">
              {productRulesDirty ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraftProductRules(savedProductRules)} disabled={saveCatalog.isPending}>
                  Discard
                </Button>
              ) : null}
              <Button type="button" size="sm" disabled={!productRulesDirty || saveCatalog.isPending} onClick={saveProductRules}>
                {saveCatalog.isPending ? 'Saving…' : 'Save filters'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            No saved filters. This campaign uses its manually selected product mix.
          </div>
        )}
      </article>

      <div>
        <MembershipBulkActionBar
          selectedCount={selection.selectedIds.length}
          onClear={selection.clearSelection}
          isPending={addProduct.isPending || removeProduct.isPending}
          onInclude={() => {
            if (productMembershipMode === 'automatic') {
              toast.info('This campaign is Automatic — edit its filters above instead of picking products here.');
              return;
            }
            const toAdd = rows.filter((row) => selection.selectedIds.includes(row.tenant_product_id) && !row.is_member);
            if (toAdd.length === 0) return;
            Promise.all(toAdd.map((row) => addProduct.mutateAsync({ tenant_product_id: row.tenant_product_id }))).then(() => selection.clearSelection());
          }}
          onRemove={() => {
            if (productMembershipMode === 'automatic') {
              toast.info('This campaign is Automatic — edit its filters above instead of picking products here.');
              return;
            }
            const toRemove = rows.filter((row) => selection.selectedIds.includes(row.tenant_product_id) && row.is_member);
            if (toRemove.length === 0) return;
            Promise.all(toRemove.map((row) => removeProduct.mutateAsync({ tenant_product_id: row.tenant_product_id }))).then(() => selection.clearSelection());
          }}
        />
        <FilterBar
          count={`${detailRowsTotal(result.data)} products${isInterim ? ' · Updating' : ''}`}
          searchPlaceholder="Search product, SKU, brand…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          groups={filterGroups}
          searchValue={search}
          searchLoading={search.trim() !== debouncedSearch.trim()}
          onSearchChange={setSearch}
          sortOptions={['Campaign order', 'Brand (A → Z)', 'Campaign Sales (high → low)', 'Units sold (high → low)']}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: <SelectAllCheckbox checked={selection.allSelected} indeterminate={selection.someSelected} onChange={selection.toggleVisible} />, width: 48, className: 'px-5' },
            { label: 'Product Name', width: 340, className: 'px-5' },
            { label: 'Member', width: 120, className: 'px-5' },
            { label: 'MRP', align: 'right', className: 'px-5' },
            { label: 'Campaign Price', width: 240, align: 'right', className: 'px-5' },
            { label: 'Base Rate', align: 'right', className: 'px-5' },
            { label: 'Cost Price', align: 'right', className: 'px-5' },
            { label: 'Current Stock', align: 'right', className: 'px-5' },
            { label: 'Campaign Sales', align: 'right', className: 'px-5' },
            { label: 'Units Sold', align: 'right', className: 'px-5' },
          ]}
          tableMinWidth={1340}
          showEmptyState={!isInitialLoading && rows.length === 0}
          emptyState={<div className="py-16 text-center text-sm text-cream-500">No products match these filters.</div>}
        >
          {isInitialLoading ? (
            <TableBodySkeleton columns={10} />
          ) : (
            rows.map((row) => {
              const isSelected = selection.selectedIds.includes(row.tenant_product_id);
              const campaignPrice = row.override_price ?? row.base_selling_price;
              const isEditing = editingProductId === row.tenant_product_id;
              return (
                <SelectableRow key={row.tenant_product_id} selected={isSelected}>
                  <td className="px-5 py-3.5"><RowSelectCheckbox checked={isSelected} onChange={() => selection.toggleRow(row.tenant_product_id)} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <ProductImageCell src={row.image_url} alt={row.product_name} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-cream-950">{row.product_name}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-cream-700">{row.sku} · {row.brand_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><MemberToggle checked={row.is_member} label={`${row.product_name} membership`} /></td>
                  <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{row.mrp != null ? formatNumberValue(row.mrp, 'CURRENCY_EXACT') : '—'}</td>
                  <td className="group px-5 py-3.5 text-right font-mono text-base text-cream-900">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <div className="inline-flex h-9 w-32 items-center rounded-[8px] border border-cream-300 bg-white px-2 focus-within:border-ember-400">
                          <span className="shrink-0 text-cream-600">₹</span>
                          <input
                            value={draftPrice}
                            onChange={(event) => setDraftPrice(formatNumberInput(event.target.value, 'CURRENCY_EXACT'))}
                            inputMode="decimal"
                            className="min-w-0 flex-1 bg-transparent text-right outline-none"
                            aria-label="Campaign price"
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={finishVisualEdit} aria-label="Finish campaign price edit"><Pencil size={14} /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingProductId(null); setDraftPrice(''); }} aria-label="Cancel campaign price edit"><X size={14} /></Button>
                      </div>
                    ) : (
                      <button type="button" className="inline-flex items-center justify-end gap-2 hover:text-ember-700" onClick={() => startVisualEdit(row)}>
                        {campaignPrice != null ? formatNumberValue(campaignPrice, 'CURRENCY_EXACT') : '—'}
                        <Pencil size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-mono text-base text-cream-900">{row.base_selling_price != null ? formatNumberValue(row.base_selling_price, 'CURRENCY_EXACT') : '—'}</p>
                    <p className="mt-0.5 text-xs text-cream-600">{row.discount_pct == null ? '—' : `${row.discount_pct >= 0 ? '-' : '+'}${formatNumberValue(Math.abs(row.discount_pct), 'PERCENTAGE')}`}</p>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-mono text-base text-cream-900">{row.cost_price != null && row.cost_price > 0 ? formatNumberValue(row.cost_price, 'CURRENCY_EXACT') : '—'}</p>
                    <p className="mt-0.5 text-xs text-cream-600">{row.margin_pct == null ? '—' : formatNumberValue(row.margin_pct, 'PERCENTAGE')}</p>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{stockLabel(row.on_hand)}</td>
                  <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{row.catalog_gmv > 0 ? formatNumberValue(row.catalog_gmv, 'CURRENCY_THRESHOLD') : '—'}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{row.catalog_units_sold}</td>
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
