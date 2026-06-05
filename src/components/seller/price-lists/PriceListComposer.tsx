'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, Search, SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EntityAvatar, PageWrap } from '@/components/seller/layout';
import {
  ComposerBasicsField,
  ComposerBasicsStrip,
  ComposerBodyGrid,
  ComposerBreadcrumbs,
  ComposerFooterBar,
  ComposerMainCard,
  ComposerShell,
  ComposerSidebarCard,
  ComposerTitleRow,
} from '@/components/seller/composer/ComposerLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DiscardChangesDialog, useDirtyCloseGuard } from '@/components/ui/form-overlay';
import { cn, formatDate } from '@/lib/utils';
import {
  type PriceListComposerProduct,
  usePriceListComposerProducts,
  usePriceListDetail,
  useSavePriceListComposer,
} from '@/hooks/usePriceLists';
import type { PriceListPricingStrategy } from '@/lib/zod';

type ComposerMode = 'create' | 'edit';

type FilterOption = {
  name: string;
  count: number;
};

function formatInr(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumberForInput(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  return String(Number(digits));
}

function isoDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function strategyLabel(value: PriceListPricingStrategy) {
  if (value === 'margin_from_mrp') return '% margin from MRP';
  if (value === 'flat_off_base') return 'Flat INR off base';
  return 'Edit each price';
}

function computeStrategyPrice(
  product: PriceListComposerProduct,
  strategy: PriceListPricingStrategy,
  strategyValue: string,
) {
  const base = Number(product.base_selling_price ?? 0);
  const mrp = Number(product.mrp ?? 0);
  if (strategy === 'margin_from_mrp') {
    const discount = Number(strategyValue || 0);
    return Math.max(0, Math.round(mrp * (1 - discount / 100)));
  }
  if (strategy === 'flat_off_base') {
    const amount = Number(strategyValue || 0);
    return Math.max(0, Math.round(base - amount));
  }
  return Math.max(0, Math.round(base));
}

function getInitials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PL';
}

function buildFilterOptions(values: Array<string | null | undefined>): FilterOption[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function computeSummaryMetrics(
  selectedProducts: PriceListComposerProduct[],
  resolvePrice: (product: PriceListComposerProduct) => number,
) {
  const productCount = selectedProducts.length;
  const brandCount = new Set(selectedProducts.map((product) => product.brand_name ?? product.id)).size;
  let discountSum = 0;
  let discountCount = 0;
  let marginSum = 0;
  let marginCount = 0;

  for (const product of selectedProducts) {
    const base = Number(product.base_selling_price ?? 0);
    const cost = Number(product.cost_price ?? 0);
    const price = resolvePrice(product);
    if (base > 0) {
      discountSum += ((base - price) / base) * 100;
      discountCount += 1;
    }
    if (cost > 0 && price > 0) {
      marginSum += ((price - cost) / price) * 100;
      marginCount += 1;
    }
  }

  return {
    productCount,
    brandCount,
    avgDiscount: discountCount > 0 ? discountSum / discountCount : null,
    avgMargin: marginCount > 0 ? marginSum / marginCount : null,
  };
}

function PriceListComposerSkeleton() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6" role="status" aria-label="Loading price list composer">
      <div className="space-y-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 animate-pulse rounded-[9px] bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
          </div>
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-300 bg-white last:border-r-0" />
          ))}
        </div>
        <div className="grid min-h-[620px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <div className="rounded-[14px] border border-cream-300 bg-white animate-pulse" />
          <div className="rounded-[14px] border border-cream-300 bg-white animate-pulse" />
          <div className="rounded-[14px] border border-cream-300 bg-white animate-pulse" />
        </div>
        <div className="sticky bottom-0 h-20 animate-pulse rounded-[14px] border border-cream-300 bg-white" />
      </div>
    </div>
  );
}

export function PriceListComposer({
  mode,
  priceListId,
}: {
  mode: ComposerMode;
  priceListId?: string;
}) {
  const router = useRouter();
  const saveMutation = useSavePriceListComposer(priceListId);
  const { data: products = [], isLoading: productsLoading, isError: productsError } = usePriceListComposerProducts();
  const {
    data: detailData,
    isLoading: detailLoading,
    isError: detailError,
  } = usePriceListDetail(priceListId ?? '');

  const detail = detailData?.price_list;
  const isLoading = productsLoading || (mode === 'edit' && detailLoading);
  const isError = productsError || (mode === 'edit' && detailError);

  const brandOptions = useMemo(
    () => buildFilterOptions(products.map((product) => product.brand_name)),
    [products],
  );
  const categoryOptions = useMemo(
    () => buildFilterOptions(products.map((product) => product.category_name)),
    [products],
  );
  const allBrandNames = useMemo(() => brandOptions.map((option) => option.name), [brandOptions]);
  const allCategoryNames = useMemo(() => categoryOptions.map((option) => option.name), [categoryOptions]);
  const selectedItemIds = useMemo(
    () => new Set(detail?.items.map((item) => item.tenant_product_id) ?? []),
    [detail?.items],
  );
  const detailItemMap = useMemo(
    () => new Map((detail?.items ?? []).map((item) => [item.tenant_product_id, item])),
    [detail?.items],
  );
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const [name, setName] = useState('');
  const [validFrom, setValidFrom] = useState(isoDateInput(new Date()));
  const [validTo, setValidTo] = useState('');
  const [priority, setPriority] = useState('0');
  const [pricingStrategy, setPricingStrategy] = useState<PriceListPricingStrategy>('edit_each');
  const [strategyValue, setStrategyValue] = useState('10');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [rowOverrides, setRowOverrides] = useState<Record<string, string>>({});
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [didInit, setDidInit] = useState(false);

  useEffect(() => {
    if (didInit || products.length === 0 || (mode === 'edit' && !detail)) return;

    const initialBrands =
      mode === 'edit'
        ? (detail?.filters?.brand_names?.length ? detail.filters.brand_names : allBrandNames)
        : [];
    const initialCategories =
      mode === 'edit'
        ? (detail?.filters?.category_names?.length ? detail.filters.category_names : allCategoryNames)
        : [];

    setName(detail?.name ?? '');
    setValidFrom(detail?.valid_from ? detail.valid_from.slice(0, 10) : isoDateInput(new Date()));
    setValidTo(detail?.valid_to ? detail.valid_to.slice(0, 10) : '');
    setPriority(String(detail?.priority ?? 0));
    setPricingStrategy(detail?.pricing_strategy ?? 'edit_each');
    setStrategyValue(detail?.strategy_value != null ? String(detail.strategy_value) : '10');
    setSelectedBrands(initialBrands);
    setSelectedCategories(initialCategories);

    const nextOverrides: Record<string, string> = {};
    const nextDeselected = new Set<string>();
    for (const product of products) {
      const defaultPrice = computeStrategyPrice(
        product,
        detail?.pricing_strategy ?? 'edit_each',
        detail?.strategy_value != null ? String(detail.strategy_value) : '10',
      );
      const item = detail?.items.find((entry) => entry.tenant_product_id === product.id);
      if (mode === 'edit' && !selectedItemIds.has(product.id)) {
        nextDeselected.add(product.id);
      }
      if (item && Math.round(Number(item.price)) !== Math.round(defaultPrice)) {
        nextOverrides[product.id] = String(Math.round(Number(item.price)));
      }
      if (mode === 'edit' && item && (detail?.pricing_strategy ?? 'edit_each') === 'edit_each') {
        nextOverrides[product.id] = String(Math.round(Number(item.price)));
      }
    }

    setRowOverrides(nextOverrides);
    setDeselectedIds(nextDeselected);
    setDidInit(true);
  }, [allBrandNames, allCategoryNames, detail, didInit, mode, products, selectedItemIds]);

  const filteredProducts = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesBrand = selectedBrands.includes(product.brand_name ?? '');
      const matchesCategory = selectedCategories.includes(product.category_name ?? '');
      if (!matchesBrand || !matchesCategory) return false;
      if (!lowered) return true;
      return (
        product.display_name.toLowerCase().includes(lowered) ||
        product.internal_sku.toLowerCase().includes(lowered) ||
        (product.brand_name ?? '').toLowerCase().includes(lowered)
      );
    });
  }, [products, search, selectedBrands, selectedCategories]);

  const visibleSelectedProducts = useMemo(
    () => filteredProducts.filter((product) => !deselectedIds.has(product.id)),
    [deselectedIds, filteredProducts],
  );

  const currentSelectionIds = useMemo(
    () => new Set(visibleSelectedProducts.map((product) => product.id)),
    [visibleSelectedProducts],
  );

  const resolveCurrentPrice = (product: PriceListComposerProduct) =>
    Number(rowOverrides[product.id] ?? computeStrategyPrice(product, pricingStrategy, strategyValue));

  const currentMetrics = useMemo(
    () => computeSummaryMetrics(visibleSelectedProducts, resolveCurrentPrice),
    [pricingStrategy, rowOverrides, strategyValue, visibleSelectedProducts],
  );

  const previousMetrics = useMemo(() => {
    if (!detail?.items?.length) return null;
    const previousProducts = detail.items
      .map((item) => productMap.get(item.tenant_product_id))
      .filter((product): product is PriceListComposerProduct => Boolean(product));
    return computeSummaryMetrics(previousProducts, (product) => Number(detailItemMap.get(product.id)?.price ?? 0));
  }, [detail?.items, detailItemMap, productMap]);

  const modifiedRows = useMemo(() => {
    if (mode !== 'edit') return 0;
    return products.reduce((count, product) => {
      const wasSelected = selectedItemIds.has(product.id);
      const isSelectedNow = currentSelectionIds.has(product.id);
      if (wasSelected !== isSelectedNow) {
        return count + 1;
      }
      if (!isSelectedNow) return count;
      const previousPrice = Number(detailItemMap.get(product.id)?.price ?? 0);
      const nextPrice = resolveCurrentPrice(product);
      return Math.round(previousPrice) !== Math.round(nextPrice) ? count + 1 : count;
    }, 0);
  }, [currentSelectionIds, detailItemMap, mode, products, selectedItemIds]);

  const serializedState = useMemo(() => JSON.stringify({
    name,
    validFrom,
    validTo,
    priority,
    pricingStrategy,
    strategyValue,
    selectedBrands,
    selectedCategories,
    deselectedIds: Array.from(deselectedIds).sort(),
    rowOverrides,
  }), [deselectedIds, name, pricingStrategy, priority, rowOverrides, selectedBrands, selectedCategories, strategyValue, validFrom, validTo]);

  useEffect(() => {
    if (!didInit || initialSnapshot) return;
    setInitialSnapshot(serializedState);
  }, [didInit, initialSnapshot, serializedState]);

  const isDirty = didInit && Boolean(initialSnapshot) && serializedState !== initialSnapshot;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const closeTarget = mode === 'edit' && priceListId ? `/price-lists/${priceListId}` : '/price-lists';
  const dirtyGuard = useDirtyCloseGuard({
    isDirty,
    onConfirmClose: () => router.push(closeTarget),
  });

  async function handleSave(saveMode: 'draft' | 'publish') {
    const itemPrices = visibleSelectedProducts.map((product) => ({
      tenant_product_id: product.id,
      price: resolveCurrentPrice(product),
      min_qty: 1,
      max_qty: null,
    }));

    const result = await saveMutation.mutateAsync({
      name,
      currency: 'INR',
      valid_from: new Date(`${validFrom}T00:00:00`),
      valid_to: validTo ? new Date(`${validTo}T23:59:59`) : undefined,
      priority: Number(priority || 0),
      pricing_strategy: pricingStrategy,
      strategy_value: pricingStrategy === 'edit_each' ? null : Number(strategyValue || 0),
      filters: {
        brand_names: selectedBrands,
        category_names: selectedCategories,
      },
      item_prices: itemPrices,
      save_mode: saveMode,
    });

    if (saveMode === 'publish') {
      router.push(`/price-lists/${result.price_list.id}`);
      return;
    }

    router.push(mode === 'edit' && priceListId ? `/price-lists/${priceListId}` : '/price-lists');
  }

  function toggleMany(
    current: string[],
    allValues: string[],
    setter: (values: string[]) => void,
  ) {
    setter(current.length === allValues.length ? [] : allValues);
  }

  if (isError || (mode === 'edit' && !detail)) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 py-6">
        <div className="rounded-[18px] border border-danger-200 bg-danger-50 p-5 text-[13px] text-danger-700">
          We couldn't load this pricelist composer right now.
        </div>
      </div>
    );
  }

  if (isLoading || !didInit) {
    return <PriceListComposerSkeleton />;
  }

  const createSubtitle = 'Filter the SKUs, apply pricing rules, and review the impact in the summary before publishing.';
  const editSubtitle = 'You are editing a live pricelist. Changes apply to new orders only; in-flight orders keep their current prices.';
  const hasActiveFilters = selectedBrands.length > 0 && selectedCategories.length > 0;
  const showBulkBanner = pricingStrategy !== 'edit_each' && filteredProducts.length > 0;
  const priceRuleSummary = pricingStrategy === 'margin_from_mrp'
    ? `Applying -${strategyValue || 0}% from MRP`
    : `Applying -₹${Number(strategyValue || 0).toLocaleString('en-IN')} off base`;

  return (
    <>
      <PageWrap className="pt-7 pb-6">
        <ComposerShell>
          <ComposerBreadcrumbs
            items={[
              { label: 'Price Lists', href: '/price-lists' },
              { label: mode === 'edit' ? detail?.name ?? 'Edit pricelist' : 'New pricelist', current: true },
            ]}
          />

          <ComposerTitleRow
            title={mode === 'edit' ? 'Edit pricelist' : 'Add a pricelist'}
            subtitle={mode === 'edit' ? editSubtitle : createSubtitle}
            status={{ label: mode === 'edit' && detail?.status === 'active' ? 'Live' : 'Draft', tone: mode === 'edit' && detail?.status === 'active' ? 'live' : 'draft' }}
            actions={
              <>
                {mode === 'create' ? (
                  <Button type="button" className="cockpit-btn cockpit-btn-secondary">
                    Import from CSV
                  </Button>
                ) : null}
                <Button type="button" className="cockpit-btn cockpit-btn-secondary" onClick={() => dirtyGuard.handleOpenChange(false)}>
                  <X className="h-3.5 w-3.5" />
                  Close
                </Button>
              </>
            }
          />

          <ComposerBasicsStrip>
            <ComposerBasicsField label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. North Delhi A-class · Summer '26"
                className="h-auto border-0 bg-transparent px-0 py-0 font-medium text-[14px] text-cream-950 shadow-none focus-visible:ring-0"
              />
            </ComposerBasicsField>

            <ComposerBasicsField label="Validity">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left text-[14px] font-medium text-cream-950"
                  >
                    <span>
                      {validFrom ? `${formatDate(validFrom)} → ${validTo ? formatDate(validTo) : 'Open ended'}` : 'Set date range'}
                    </span>
                    <CalendarDays className="h-4 w-4 shrink-0 text-cream-600" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[340px] border-cream-300 bg-white p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-700">From date</p>
                      <Input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-700">To date</p>
                      <Input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </ComposerBasicsField>

            <ComposerBasicsField label="Priority">
              <Input
                type="number"
                min={0}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="h-auto border-0 bg-transparent px-0 py-0 font-mono text-[14px] font-medium text-cream-950 shadow-none focus-visible:ring-0"
              />
            </ComposerBasicsField>

            <ComposerBasicsField label="Selection" className="px-4 py-3">
              <div className="mt-2 flex items-center gap-2 text-[14px] font-medium text-cream-950">
                <span>{currentMetrics.productCount} products</span>
                <span className="text-cream-500">·</span>
                <span>{currentMetrics.brandCount} brands</span>
              </div>
            </ComposerBasicsField>
          </ComposerBasicsStrip>

          <ComposerBodyGrid
            left={
              <ComposerSidebarCard>
              <div className="space-y-5">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Brands</h3>
                    <button
                      type="button"
                      className="text-[12px] font-medium text-teal-700 hover:text-teal-800"
                      onClick={() => toggleMany(selectedBrands, allBrandNames, setSelectedBrands)}
                    >
                      {selectedBrands.length === allBrandNames.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {brandOptions.map((brand) => (
                      <label key={brand.name} className="flex items-center justify-between gap-3 text-[13px] text-cream-900">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedBrands.includes(brand.name)}
                            onChange={(event) => {
                              setSelectedBrands((current) =>
                                event.target.checked
                                  ? [...current, brand.name]
                                  : current.filter((item) => item !== brand.name),
                              );
                            }}
                            className="accent-teal-500"
                          />
                          <span>{brand.name}</span>
                        </span>
                        <span className="font-mono text-[11px] text-cream-700">{brand.count}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Category</h3>
                    <button
                      type="button"
                      className="text-[12px] font-medium text-teal-700 hover:text-teal-800"
                      onClick={() => toggleMany(selectedCategories, allCategoryNames, setSelectedCategories)}
                    >
                      {selectedCategories.length === allCategoryNames.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {categoryOptions.map((category) => (
                      <label key={category.name} className="flex items-center justify-between gap-3 text-[13px] text-cream-900">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(category.name)}
                            onChange={(event) => {
                              setSelectedCategories((current) =>
                                event.target.checked
                                  ? [...current, category.name]
                                  : current.filter((item) => item !== category.name),
                              );
                            }}
                            className="accent-teal-500"
                          />
                          <span>{category.name}</span>
                        </span>
                        <span className="font-mono text-[11px] text-cream-700">{category.count}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Pricing strategy</h3>
                  <div className="space-y-3">
                    <label className="block space-y-2">
                      <span className="flex items-center gap-2 text-[13px] text-cream-900">
                        <input
                          type="radio"
                          name="pricing-strategy"
                          checked={pricingStrategy === 'edit_each'}
                          onChange={() => setPricingStrategy('edit_each')}
                          className="accent-teal-500"
                        />
                        Edit each price
                      </span>
                    </label>

                    <label className="block space-y-2">
                      <span className="flex items-center gap-2 text-[13px] text-cream-900">
                        <input
                          type="radio"
                          name="pricing-strategy"
                          checked={pricingStrategy === 'margin_from_mrp'}
                          onChange={() => setPricingStrategy('margin_from_mrp')}
                          className="accent-teal-500"
                        />
                        % margin from MRP
                      </span>
                      <div
                        className={cn(
                          'ml-6 flex items-center gap-2 rounded-[8px] border px-3 py-2 font-mono text-[12px]',
                          pricingStrategy === 'margin_from_mrp'
                            ? 'border-ember-400 bg-white shadow-[0_0_0_3px_rgba(194,110,58,0.20)]'
                            : 'border-cream-300 bg-cream-100 text-cream-600',
                        )}
                      >
                        <span className="text-cream-700">-</span>
                        <input
                          value={strategyValue}
                          onChange={(event) => setStrategyValue(event.target.value.replace(/[^\d.]/g, ''))}
                          inputMode="decimal"
                          disabled={pricingStrategy !== 'margin_from_mrp'}
                          className="w-14 bg-transparent text-right outline-none disabled:cursor-not-allowed"
                        />
                        <span className="text-cream-700">%</span>
                      </div>
                    </label>

                    <label className="block space-y-2">
                      <span className="flex items-center gap-2 text-[13px] text-cream-900">
                        <input
                          type="radio"
                          name="pricing-strategy"
                          checked={pricingStrategy === 'flat_off_base'}
                          onChange={() => setPricingStrategy('flat_off_base')}
                          className="accent-teal-500"
                        />
                        Flat INR off base
                      </span>
                      <div
                        className={cn(
                          'ml-6 flex items-center gap-2 rounded-[8px] border px-3 py-2 font-mono text-[12px]',
                          pricingStrategy === 'flat_off_base'
                            ? 'border-ember-400 bg-white shadow-[0_0_0_3px_rgba(194,110,58,0.20)]'
                            : 'border-cream-300 bg-cream-100 text-cream-600',
                        )}
                      >
                        <span className="text-cream-700">-₹</span>
                        <input
                          value={strategyValue}
                          onChange={(event) => setStrategyValue(event.target.value.replace(/[^\d.]/g, ''))}
                          inputMode="decimal"
                          disabled={pricingStrategy !== 'flat_off_base'}
                          className="w-16 bg-transparent text-right outline-none disabled:cursor-not-allowed"
                        />
                      </div>
                    </label>

                    <div className="rounded-[8px] border border-dashed border-cream-400 bg-cream-50 px-3 py-2 text-[11.5px] leading-[1.45] text-cream-700">
                      {pricingStrategy === 'edit_each' ? (
                        <>
                          <strong className="font-medium text-cream-900">Edit each price inline.</strong> No global rule is applied.
                        </>
                      ) : pricingStrategy === 'margin_from_mrp' ? (
                        <>
                          <strong className="font-medium text-cream-900">-{strategyValue || 0}% from MRP</strong> applies to all selected products. Click a row price to override it.
                        </>
                      ) : (
                        <>
                          <strong className="font-medium text-cream-900">-₹{Number(strategyValue || 0).toLocaleString('en-IN')} off base</strong> applies to all selected products. Click a row price to override it.
                        </>
                      )}
                    </div>
                  </div>
                </section>
              </div>
              </ComposerSidebarCard>
            }
            center={
              <ComposerMainCard>
              <div className="flex flex-wrap items-center gap-3 border-b border-cream-300 bg-cream-50 px-4 py-3">
                <div>
                  <div className="text-[13px] font-semibold text-cream-900">
                    {mode === 'edit'
                      ? `${currentMetrics.productCount} products · ${modifiedRows} modified`
                      : `${filteredProducts.length} products match`}
                  </div>
                  <div className="text-[12px] text-cream-700">
                    {hasActiveFilters
                      ? `Pricing strategy: ${strategyLabel(pricingStrategy)}`
                      : 'Pick at least one brand and one category to populate the table.'}
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[240px] items-center gap-2 rounded-[8px] border border-cream-300 bg-white px-3 py-2 text-[13px] text-cream-700">
                    <Search className="h-4 w-4 text-cream-600" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search SKU or product name"
                      className="w-full bg-transparent outline-none placeholder:text-cream-600"
                    />
                  </div>
                  <Button type="button" className="cockpit-btn cockpit-btn-secondary">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Bulk adjust
                  </Button>
                </div>
              </div>

              {showBulkBanner ? (
                <div className="flex items-center gap-3 border-b border-ember-100 bg-ember-50 px-4 py-3 text-[12.5px] text-ember-700">
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <strong className="font-semibold">{priceRuleSummary}</strong>{' '}
                    to all {visibleSelectedProducts.length} selected products.
                    <div className="mt-0.5 text-[11.5px] text-cream-700">
                      {Object.keys(rowOverrides).length === 0
                        ? 'No row overrides yet. Click any New price cell to override that one row.'
                        : `${Object.keys(rowOverrides).length} row override${Object.keys(rowOverrides).length === 1 ? '' : 's'} preserved.`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-[6px] border border-ember-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ember-700 hover:bg-ember-50"
                    onClick={() => setRowOverrides({})}
                  >
                    Reset overrides
                  </button>
                </div>
              ) : null}

              {!hasActiveFilters ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-[24px] border-[1.5px] border-dashed border-cream-400 bg-cream-50">
                    <SlidersHorizontal className="h-9 w-9 text-cream-600" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-display text-[22px] font-medium tracking-[-0.01em] text-cream-900">
                      No products selected yet
                    </h2>
                    <p className="max-w-[42ch] text-[13.5px] leading-[1.55] text-cream-700">
                      Pick a brand and category on the left to bring matching SKUs into this table. You can then apply a pricing rule or edit row prices one by one.
                    </p>
                  </div>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-8 py-16 text-[13px] text-cream-700">
                  No products match the current filters and search.
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead className="sticky top-0 z-[1] bg-cream-50">
                      <tr>
                        <th className="w-9 border-b border-cream-300 px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">
                          <input
                            type="checkbox"
                            checked={filteredProducts.length > 0 && visibleSelectedProducts.length === filteredProducts.length}
                            onChange={(event) => {
                              const visibleIds = filteredProducts.map((product) => product.id);
                              setDeselectedIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked) {
                                  visibleIds.forEach((id) => next.delete(id));
                                } else {
                                  visibleIds.forEach((id) => next.add(id));
                                }
                                return next;
                              });
                            }}
                            className="accent-teal-500"
                          />
                        </th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Product</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">MRP</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Base</th>
                        {mode === 'edit' ? (
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Was</th>
                        ) : null}
                        <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">New price</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product, index) => {
                        const basePrice = Number(product.base_selling_price ?? 0);
                        const nextPrice = resolveCurrentPrice(product);
                        const previousPrice = detailItemMap.get(product.id)?.price ?? null;
                        const isSelected = !deselectedIds.has(product.id);
                        const isChanged = previousPrice != null && Math.round(Number(previousPrice)) !== Math.round(nextPrice);
                        const deltaPct = basePrice > 0 ? ((nextPrice - basePrice) / basePrice) * 100 : 0;
                        const imageUrl = product.image_urls?.[0] ?? null;

                        return (
                          <tr
                            key={product.id}
                            className={cn(
                              'border-b border-cream-300 last:border-b-0',
                              isChanged ? 'bg-ember-50/40' : 'bg-white',
                            )}
                          >
                            <td className="px-4 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) => {
                                  setDeselectedIds((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.delete(product.id);
                                    else next.add(product.id);
                                    return next;
                                  });
                                }}
                                className="accent-teal-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {imageUrl ? (
                                  <img
                                    src={imageUrl}
                                    alt={product.display_name}
                                    className="h-8 w-8 rounded-[8px] border border-cream-300 object-cover"
                                  />
                                ) : (
                                  <EntityAvatar
                                    initials={getInitials(product.brand_name ?? product.display_name)}
                                    hue={index % 3 === 1 ? 'ember' : index % 3 === 2 ? 'cream' : 'teal'}
                                    size={32}
                                    className="rounded-[8px]"
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-[13.5px] font-medium text-cream-900">{product.display_name}</p>
                                  <p className="mt-0.5 truncate font-mono text-[11px] text-cream-700">{product.internal_sku}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{formatInr(product.mrp)}</td>
                            <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{formatInr(product.base_selling_price)}</td>
                            {mode === 'edit' ? (
                              <td className="px-4 py-3 text-right font-mono font-medium text-cream-700">
                                {previousPrice != null ? formatInr(previousPrice) : '—'}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-right">
                              <div
                                className={cn(
                                  'ml-auto inline-flex h-9 w-[108px] items-center justify-end gap-1 rounded-[6px] border bg-white px-2.5 font-mono text-[12px]',
                                  isSelected
                                    ? 'border-cream-400'
                                    : 'border-cream-300 bg-cream-100 text-cream-600',
                                  (isChanged || Boolean(rowOverrides[product.id])) && isSelected
                                    ? 'border-ember-400 shadow-[0_0_0_3px_rgba(194,110,58,0.20)]'
                                    : '',
                                )}
                              >
                                <span className="text-cream-700">₹</span>
                                <input
                                  value={formatNumberForInput(nextPrice)}
                                  onChange={(event) =>
                                    setRowOverrides((current) => ({
                                      ...current,
                                      [product.id]: parseCurrencyInput(event.target.value),
                                    }))
                                  }
                                  className="w-full bg-transparent text-right outline-none"
                                  inputMode="numeric"
                                  disabled={!isSelected}
                                />
                              </div>
                            </td>
                            <td className={cn(
                              'px-4 py-3 text-right font-mono text-[11px] font-medium',
                              deltaPct <= 0 ? 'text-danger-500' : 'text-success-500',
                            )}>
                              {deltaPct > 0 ? '+' : ''}
                              {deltaPct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </ComposerMainCard>
            }
            right={
              <ComposerSidebarCard>
              <div className="flex h-full flex-col gap-4">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">
                    {mode === 'edit' ? 'Diff · what will change' : 'Pricelist summary'}
                  </h3>
                  <div className="mt-4">
                    <p className="font-display text-[18px] font-medium tracking-[-0.005em] text-cream-900">
                      {name || 'Untitled pricelist'}
                    </p>
                    <p className="mt-1 text-[12px] text-cream-700">
                      {mode === 'edit'
                        ? `Created by ${detail?.created_by_label ?? 'Team member'}`
                        : hasActiveFilters
                          ? `Applies to ${currentMetrics.productCount} selected products`
                          : 'Set filters and pricing rules to see the impact here.'}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-cream-300" />

                {mode === 'edit' ? (
                  <>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-cream-700">Modified rows</p>
                        <div className="flex items-baseline gap-2 font-mono">
                          <span className="text-[14px] font-medium text-cream-900">{modifiedRows}</span>
                          <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[11px] text-cream-700">
                            of {currentMetrics.productCount}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-cream-700">Avg discount vs base</p>
                        <div className="flex items-baseline gap-2 font-mono">
                          <span className="text-[12px] text-cream-700 line-through">
                            {previousMetrics?.avgDiscount == null ? '—' : `-${Math.abs(previousMetrics.avgDiscount).toFixed(1)}%`}
                          </span>
                          <span className="text-[14px] font-medium text-cream-900">
                            {currentMetrics.avgDiscount == null ? '—' : `-${Math.abs(currentMetrics.avgDiscount).toFixed(1)}%`}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-cream-700">Avg margin retained</p>
                        <div className="flex items-baseline gap-2 font-mono">
                          <span className="text-[12px] text-cream-700 line-through">
                            {previousMetrics?.avgMargin == null ? '—' : `${previousMetrics.avgMargin.toFixed(1)}%`}
                          </span>
                          <span className="text-[14px] font-medium text-cream-900">
                            {currentMetrics.avgMargin == null ? '—' : `${currentMetrics.avgMargin.toFixed(1)}%`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-cream-300" />
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-cream-700">Products</span>
                        <span className="font-mono font-medium text-cream-900">{currentMetrics.productCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-cream-700">Brands</span>
                        <span className="font-mono font-medium text-cream-900">{currentMetrics.brandCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-cream-700">Avg discount vs base</span>
                        <span className="font-mono font-medium text-cream-900">
                          {currentMetrics.avgDiscount == null ? '—' : `-${Math.abs(currentMetrics.avgDiscount).toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-cream-700">Avg margin retained</span>
                        <span className="font-mono font-medium text-cream-900">
                          {currentMetrics.avgMargin == null ? '—' : `${currentMetrics.avgMargin.toFixed(1)}%`}
                        </span>
                      </div>
                    </div>

                    <div className="h-px bg-cream-300" />
                  </>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-cream-700">Valid from</span>
                    <span className="font-mono font-medium text-cream-900">{validFrom ? formatDate(validFrom) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-cream-700">Valid until</span>
                    <span className="font-mono font-medium text-cream-900">{validTo ? formatDate(validTo) : 'Open ended'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-cream-700">Priority</span>
                    <span className="font-mono font-medium text-cream-900">{priority || '0'}</span>
                  </div>
                </div>

                <div
                  className={cn(
                    'mt-auto rounded-[10px] border px-3 py-3 text-[12px] leading-[1.5]',
                    mode === 'edit' && detail?.status === 'active'
                      ? 'border-warning-200 bg-warning-50 text-warning-800'
                      : 'border-teal-200 bg-teal-50 text-teal-700',
                  )}
                >
                  {mode === 'edit' && detail?.status === 'active' ? (
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
                      <span>
                        Saving will update this live pricelist for future orders only. In-flight orders keep their current prices.
                      </span>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                      <span>Ready to publish once the selected products, prices, and summary look right.</span>
                    </div>
                  )}
                </div>
              </div>
              </ComposerSidebarCard>
            }
          />

          <ComposerFooterBar>
            <div className="flex items-center gap-3">
              <div className={cn(
                'inline-flex items-center gap-2 text-[12px]',
                isDirty ? 'text-ember-700' : 'text-cream-700',
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', isDirty ? 'bg-ember-400' : 'bg-success-500')} />
                {isDirty ? 'Unsaved changes' : mode === 'edit' ? 'Draft saved · auto-resumes if you close' : 'Auto-saves as you type'}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => dirtyGuard.handleOpenChange(false)}>
                  {mode === 'edit' ? 'Revert changes' : 'Discard draft'}
                </Button>
                <Button
                  type="button"
                  className="cockpit-btn cockpit-btn-secondary"
                  onClick={() => void handleSave('draft')}
                  disabled={saveMutation.isPending}
                >
                  {mode === 'edit' ? 'Save as draft' : 'Save & close'}
                </Button>
                <Button
                  type="button"
                  className="cockpit-btn cockpit-btn-primary"
                  onClick={() => void handleSave('publish')}
                  disabled={saveMutation.isPending || currentMetrics.productCount === 0}
                >
                  {mode === 'edit' ? 'Save & apply to live' : 'Publish pricelist'}
                </Button>
              </div>
            </div>
          </ComposerFooterBar>
        </ComposerShell>
      </PageWrap>

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />
    </>
  );
}
