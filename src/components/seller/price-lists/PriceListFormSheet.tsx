'use client';

import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Check } from 'lucide-react';
import {
  DiscardChangesDialog,
  FormBlock,
  FormOverlay,
  FormOverlayBody,
  FormOverlayFooter,
  FormOverlayHeader,
  FormSectionGrid,
  useDirtyCloseGuard,
} from '@/components/ui/form-overlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MutationButton } from '@/components/ui/mutation-button';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AutomaticProductMembershipPanel } from '@/components/seller/shared/AutomaticMembershipRulesPanel';
import { ProductPickerRow } from '@/components/seller/shared/ProductPickerRow';
import { PickerFiltersPanel } from '@/components/seller/shared/PickerFiltersPanel';
import { SelectedItemsChipsPanel } from '@/components/seller/shared/SelectedItemsChipsPanel';
import { SelectAllCheckbox } from '@/components/seller/shared/SelectableMembershipTable';
import {
  MembershipModeSwitchDialog,
  type MembershipModeSwitchDirection,
} from '@/components/seller/shared/MembershipModeSwitchDialog';
import { isoDateString } from '@/lib/date-utils';
import { formatStrategySummary } from '@/lib/price-list-strategy';
import { PriceListFormPayloadSchema, type PriceListFormPayload } from '@/lib/zod';
import { useSaveSimplePriceList } from '@/hooks/usePriceLists';
import { useProductPickerSearch } from '@/hooks/useProductPicker';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePickerSelection, getLoadedSelectionState } from '@/hooks/usePickerSelection';
import { usePickerFilterState } from '@/hooks/usePickerFilterState';
import { PRODUCT_ADVANCED_FILTERS, PRODUCT_QUICK_ADVANCED_LINKS, PRODUCT_QUICK_FILTERS } from '@/lib/picker-filters';

interface PriceListFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  priceListId?: string;
  defaultValues?: Partial<PriceListFormPayload>;
}

export function PriceListFormSheet({ open, onOpenChange, mode, priceListId, defaultValues }: PriceListFormSheetProps) {
  const mutation = useSaveSimplePriceList(priceListId);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<MembershipModeSwitchDirection | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const form = useForm<PriceListFormPayload>({
    resolver: zodResolver(PriceListFormPayloadSchema),
    defaultValues: {
      form_mode: 'simple',
      name: '',
      description: '',
      valid_from: new Date(),
      priority: 0,
      pricing_strategy: 'edit_each',
      strategy_value: null,
      membership_mode: 'manual',
      selected_product_ids: [],
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      form_mode: 'simple',
      name: '',
      description: '',
      valid_from: new Date(),
      priority: 0,
      pricing_strategy: 'edit_each',
      strategy_value: null,
      membership_mode: 'manual',
      selected_product_ids: [],
      ...defaultValues,
    });
  }, [defaultValues, form, open]);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      form.reset();
      onOpenChange(false);
    },
  });

  const membershipMode = form.watch('membership_mode');
  const pricingStrategy = form.watch('pricing_strategy');
  const selectedProductIds = form.watch('selected_product_ids') ?? [];
  const initialMembershipMode = defaultValues?.membership_mode ?? 'manual';
  const productFilterState = usePickerFilterState(PRODUCT_QUICK_ADVANCED_LINKS);
  const productsQuery = useProductPickerSearch({
    query: productSearch,
    selectedIds: selectedProductIds,
    limit: 30,
    enabled: productPickerOpen && membershipMode === 'manual',
    brandIds: productFilterState.advancedValues.brand ? [productFilterState.advancedValues.brand] : [],
    categoryIds: productFilterState.advancedValues.category ? [productFilterState.advancedValues.category] : [],
    stockBucket: (productFilterState.advancedValues.stock ?? null) as any,
    status: (productFilterState.advancedValues.status ?? null) as any,
    quickFilters: productFilterState.quickFilters,
  });
  const productFilterLookups = productsQuery.data?.pages[0]?.filters ?? { brands: [], categories: [] };
  const productAdvancedFilters = useMemo(
    () => [
      ...PRODUCT_ADVANCED_FILTERS,
      { key: 'brand', label: 'Brand', options: productFilterLookups.brands.map((b) => ({ value: b.id, label: b.label })) },
      { key: 'category', label: 'Category', options: productFilterLookups.categories.map((c) => ({ value: c.id, label: c.label })) },
    ],
    [productFilterLookups],
  );
  const productRows = productsQuery.data?.pages.flatMap((page) => page.products) ?? [];
  const selectedProductRows = productsQuery.data?.pages.flatMap((page) => page.selected_products ?? []) ?? [];
  const productMap = new Map([...selectedProductRows, ...productRows].map((product) => [product.id, product]));
  const productSelection = usePickerSelection(selectedProductIds, (ids) =>
    form.setValue('selected_product_ids', ids, { shouldDirty: true, shouldTouch: true, shouldValidate: true }),
  );
  const selectedProductSet = productSelection.selectedSet;
  const productLoadedState = getLoadedSelectionState(productRows.map((p) => p.id), selectedProductSet);
  const selectedProductSummary = selectedProductIds.length === 0
    ? 'Select products'
    : `${productMap.get(selectedProductIds[0])?.display_name ?? 'Selected product'}${selectedProductIds.length > 1 ? ` +${selectedProductIds.length - 1} more` : ''}`;
  const { sentinelRef } = useInfiniteScroll({
    hasMore: productsQuery.hasNextPage ?? false,
    isLoading: productsQuery.isFetchingNextPage,
    rootMargin: '240px',
    onLoadMore: () => {
      void productsQuery.fetchNextPage();
    },
  });

  const requestModeChange = (nextMode: 'manual' | 'automatic') => {
    if (mode === 'edit' && nextMode !== initialMembershipMode) {
      setPendingModeSwitch(nextMode === 'automatic' ? 'to_automatic' : 'to_manual');
      return;
    }
    form.setValue('membership_mode', nextMode, { shouldDirty: true });
  };

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Pricing"
          title={mode === 'edit' ? 'Edit pricelist' : 'Add a pricelist'}
          description="Update only the pricelist header here. Product pricing and assignments stay in the detail tabs."
        />
        <FormOverlayBody className="space-y-5">
          <Form {...form}>
            <form
              id="price-list-form"
              className="space-y-5"
              onSubmit={form.handleSubmit(async (values) => {
                await mutation.mutateAsync(values);
                form.reset();
                onOpenChange(false);
              })}
            >
              <FormBlock title="Details">
                <FormSectionGrid columns={1}>
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input {...field} placeholder="Monsoon pricing 2026" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea {...field} rows={3} placeholder="When to use this pricelist" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </FormSectionGrid>
              </FormBlock>
              <FormBlock>
                <FormSectionGrid columns={2}>
                  <FormField control={form.control} name="valid_from" render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <DatePicker
                          label="Valid from"
                          mode="overlay"
                          showSummary={false}
                          value={field.value instanceof Date ? isoDateString(field.value) : ''}
                          onChange={(next) => field.onChange(next ? new Date(`${next}T00:00:00`) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="valid_to" render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <DatePicker
                          label="Valid to"
                          mode="overlay"
                          showSummary={false}
                          value={field.value instanceof Date ? isoDateString(field.value) : ''}
                          onChange={(next) => field.onChange(next ? new Date(`${next}T23:59:59`) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </FormSectionGrid>
              </FormBlock>
              <FormBlock>
                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <FormControl><Input type="number" min={0} {...field} onChange={(event) => field.onChange(event.target.valueAsNumber)} /></FormControl>
                    <p className="text-sm text-cream-600">Pricelists with higher priority get more importance in pricing and supersede lower-priority pricelists or base rate.</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </FormBlock>
              <FormBlock title="Pricing mode">
                <FormSectionGrid columns={pricingStrategy === 'edit_each' ? 1 : 2}>
                  <FormField control={form.control} name="pricing_strategy" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pricing mode</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          form.setValue('pricing_strategy', value as 'edit_each' | 'flat_off_base' | 'percentage', { shouldDirty: true });
                          if (value === 'edit_each') form.setValue('strategy_value', null, { shouldDirty: true });
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select pricing mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="edit_each">Manual pricing</SelectItem>
                          <SelectItem value="flat_off_base">Flat ₹ off base rate</SelectItem>
                          <SelectItem value="percentage">% off base rate</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-cream-600">{formatStrategySummary(pricingStrategy, form.watch('strategy_value'))}</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {pricingStrategy !== 'edit_each' ? (
                    <FormField control={form.control} name="strategy_value" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{pricingStrategy === 'percentage' ? '% off' : 'Flat ₹ off'}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            value={field.value ?? ''}
                            onChange={(event) => field.onChange(event.target.valueAsNumber || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ) : null}
                </FormSectionGrid>
              </FormBlock>
              <FormBlock title="Targeting">
                <FormField
                  control={form.control}
                  name="membership_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product selection mode</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => requestModeChange(value as 'manual' | 'automatic')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select product selection mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="manual">Manual selection</SelectItem>
                          <SelectItem value="automatic">Automatic filters</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-cream-600">
                        {membershipMode === 'automatic'
                          ? 'Products are computed from the filters below and kept up to date automatically.'
                          : 'Choose the products that should start in this pricelist. Draft prices will seed from the current base selling price.'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {membershipMode === 'automatic' ? (
                  <FormField
                    control={form.control}
                    name="rules"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <AutomaticProductMembershipPanel
                          rules={field.value ?? { brand_names: [], category_names: [] }}
                          onRulesChange={field.onChange}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="selected_product_ids"
                    render={() => (
                      <FormItem>
                        <FormLabel>Product selection</FormLabel>
                        <SearchOverlayPicker
                          open={productPickerOpen}
                          onOpenChange={(next) => {
                            setProductPickerOpen(next);
                            if (!next) setProductSearch('');
                          }}
                          title="Select products"
                          eyebrow="Pricing"
                          description="Choose the products that should be included in this pricelist."
                          triggerTitle={selectedProductSummary}
                          triggerDescription={selectedProductIds.length > 0 ? `${selectedProductIds.length} products selected` : 'Search and add products'}
                          searchValue={productSearch}
                          onSearchValueChange={setProductSearch}
                          searchPlaceholder="Search products, SKU, or brand…"
                          selectedItemsSummary={(
                            <SelectedItemsChipsPanel
                              label="Selected products"
                              items={selectedProductIds.map((productId) => ({
                                id: productId,
                                label: productMap.get(productId)?.display_name ?? 'Selected product',
                              }))}
                              onRemove={(productId) => form.setValue(
                                'selected_product_ids',
                                selectedProductIds.filter((id) => id !== productId),
                                { shouldDirty: true, shouldTouch: true, shouldValidate: true },
                              )}
                            />
                          )}
                          filtersPanel={(
                            <PickerFiltersPanel
                              quickFilters={PRODUCT_QUICK_FILTERS}
                              activeQuickFilters={productFilterState.quickFilters}
                              onToggleQuickFilter={productFilterState.toggleQuickFilter}
                              advancedFilters={productAdvancedFilters}
                              advancedValues={productFilterState.advancedValues}
                              onAdvancedChange={productFilterState.setAdvancedFilter}
                            />
                          )}
                          selectionSummary={(
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-sm text-cream-700">
                                <SelectAllCheckbox
                                  checked={productLoadedState.allLoadedSelected}
                                  indeterminate={productLoadedState.someLoadedSelected}
                                  onChange={() => productSelection.toggleAllLoaded(productRows.map((p) => p.id))}
                                  label="Select all loaded products"
                                />
                                Select all
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={selectedProductIds.length === 0}
                                onClick={productSelection.clearAll}
                              >
                                Clear selection
                              </Button>
                            </div>
                          )}
                          footer={(
                            <div className="flex items-center justify-end gap-2">
                              <Button type="button" variant="ghost" onClick={() => setProductPickerOpen(false)}>
                                Cancel
                              </Button>
                              <Button type="button" onClick={() => setProductPickerOpen(false)}>
                                <Check className="h-3.5 w-3.5" />
                                {`Select ${selectedProductIds.length} products`}
                              </Button>
                            </div>
                          )}
                        >
                          {productsQuery.isFetching && productRows.length === 0 ? (
                            <div className="space-y-1">
                              {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={idx} className="h-12 animate-pulse rounded-[8px] bg-cream-100" />
                              ))}
                            </div>
                          ) : productRows.length > 0 ? (
                            <div className="space-y-0.5">
                              {productRows.map((product) => (
                                <ProductPickerRow
                                  key={product.id}
                                  product={product}
                                  selected={selectedProductSet.has(product.id)}
                                  onClick={() => form.setValue(
                                    'selected_product_ids',
                                    selectedProductSet.has(product.id)
                                      ? selectedProductIds.filter((id) => id !== product.id)
                                      : [...selectedProductIds, product.id],
                                    { shouldDirty: true, shouldTouch: true, shouldValidate: true },
                                  )}
                                />
                              ))}
                              {productsQuery.hasNextPage ? <div ref={sentinelRef} className="h-4" /> : null}
                            </div>
                          ) : (
                            <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                              No products match this search.
                            </p>
                          )}
                        </SearchOverlayPicker>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </FormBlock>
            </form>
          </Form>
        </FormOverlayBody>
        <FormOverlayFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => dirtyGuard.handleOpenChange(false)}>Cancel</Button>
          <MutationButton type="submit" form="price-list-form" isPending={mutation.isPending} pendingLabel="Saving…">
            {mode === 'edit' ? 'Save changes' : 'Create pricelist'}
          </MutationButton>
        </FormOverlayFooter>
      </FormOverlay>
      <DiscardChangesDialog open={dirtyGuard.discardOpen} onOpenChange={dirtyGuard.setDiscardOpen} onDiscard={dirtyGuard.confirmDiscard} />
      <MembershipModeSwitchDialog
        open={pendingModeSwitch !== null}
        onOpenChange={(next) => {
          if (!next) setPendingModeSwitch(null);
        }}
        direction={pendingModeSwitch ?? 'to_automatic'}
        affectedCount={0}
        onConfirm={() => {
          if (pendingModeSwitch) {
            form.setValue('membership_mode', pendingModeSwitch === 'to_automatic' ? 'automatic' : 'manual', { shouldDirty: true });
          }
          setPendingModeSwitch(null);
        }}
      />
    </>
  );
}
