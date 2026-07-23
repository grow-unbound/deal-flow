'use client';

import { useEffect, useState } from 'react';
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
import { MembershipFilterPanel } from '@/components/seller/shared/MembershipFilterPanel';
import {
  MembershipModeSwitchDialog,
  type MembershipModeSwitchDirection,
} from '@/components/seller/shared/MembershipModeSwitchDialog';
import { isoDateString } from '@/lib/date-utils';
import { PriceListFormPayloadSchema, type PriceListFormPayload } from '@/lib/zod';
import { usePriceListComposerProducts, useSaveSimplePriceList } from '@/hooks/usePriceLists';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

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
  const selectedProductIds = form.watch('selected_product_ids') ?? [];
  const initialMembershipMode = defaultValues?.membership_mode ?? 'manual';
  const productsQuery = usePriceListComposerProducts({ search: productSearch, limit: 30 }, productPickerOpen && membershipMode === 'manual');
  const productRows = productsQuery.data?.pages.flatMap((page) => page.products) ?? [];
  const productMap = new Map(productRows.map((product) => [product.id, product]));
  const selectedProductSet = new Set(selectedProductIds);
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
                        <MembershipFilterPanel
                          entityType="price_list"
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
                          {selectedProductIds.length > 0 ? (
                            <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Selected products</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedProductIds.map((productId) => {
                                  const product = productMap.get(productId);
                                  return (
                                    <button
                                      key={productId}
                                      type="button"
                                      onClick={() => form.setValue('selected_product_ids', selectedProductIds.filter((id) => id !== productId), { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                                      className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100"
                                    >
                                      <span>{product?.display_name ?? 'Selected product'}</span>
                                      <span aria-hidden="true" className="text-teal-700">×</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          {productsQuery.isFetching && productRows.length === 0 ? (
                            <div className="space-y-1">
                              {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={idx} className="h-12 animate-pulse rounded-[8px] bg-cream-100" />
                              ))}
                            </div>
                          ) : productRows.length > 0 ? (
                            <div className="space-y-0.5">
                              {productRows.map((product) => {
                                const selected = selectedProductSet.has(product.id);
                                return (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => form.setValue(
                                      'selected_product_ids',
                                      selected
                                        ? selectedProductIds.filter((id) => id !== product.id)
                                        : [...selectedProductIds, product.id],
                                      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
                                    )}
                                    className={[
                                      'flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-left transition-colors',
                                      selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                                    ].join(' ')}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-base font-medium text-cream-900">{product.display_name}</p>
                                      <p className="mt-0.5 text-sm text-cream-700">
                                        {product.brand_name}
                                        {product.internal_sku ? ` · ${product.internal_sku}` : ''}
                                      </p>
                                    </div>
                                    <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                      {selected ? 'Selected' : 'Add'}
                                    </span>
                                  </button>
                                );
                              })}
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
