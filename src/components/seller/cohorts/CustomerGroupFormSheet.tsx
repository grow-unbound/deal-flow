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
import { useTenantBrands } from '@/hooks/useBrands';
import { useCohortComposerBuyers, useSaveSimpleCustomerGroup } from '@/hooks/useCohorts';
import { CustomerGroupFormPayloadSchema, type CustomerGroupFormPayload } from '@/lib/zod';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface CustomerGroupFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  cohortId?: string;
  defaultValues?: Partial<CustomerGroupFormPayload>;
}

export function CustomerGroupFormSheet({
  open,
  onOpenChange,
  mode,
  cohortId,
  defaultValues,
}: CustomerGroupFormSheetProps) {
  const mutation = useSaveSimpleCustomerGroup(cohortId);
  const { data: brandData } = useTenantBrands();
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [buyerPickerOpen, setBuyerPickerOpen] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState('');
  const brands = brandData?.brands ?? [];
  const [pendingModeSwitch, setPendingModeSwitch] = useState<MembershipModeSwitchDirection | null>(null);

  const form = useForm<CustomerGroupFormPayload>({
    resolver: zodResolver(CustomerGroupFormPayloadSchema),
    defaultValues: {
      form_mode: 'simple',
      name: '',
      description: '',
      allowed_tenant_brand_ids: [],
      membership_mode: 'manual',
      selected_buyer_ids: [],
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      form_mode: 'simple',
      name: '',
      description: '',
      allowed_tenant_brand_ids: [],
      membership_mode: 'manual',
      selected_buyer_ids: [],
      ...defaultValues,
    });
  }, [defaultValues, form, open]);

  // Mode switch (Manual <-> Automatic) is only editable here, in the Edit overlay, never
  // inline in the Details tab (requirement 6). Switching away from an existing cohort's saved
  // mode needs a confirmation warning; creating a brand-new cohort does not (nothing to lose).
  const membershipMode = form.watch('membership_mode');
  const initialMembershipMode = defaultValues?.membership_mode ?? 'manual';
  const affectedMemberCount = defaultValues && 'cached_member_count' in defaultValues
    ? Number((defaultValues as { cached_member_count?: number }).cached_member_count ?? 0)
    : 0;

  const requestModeChange = (nextMode: 'manual' | 'automatic') => {
    if (mode === 'edit' && nextMode !== initialMembershipMode) {
      setPendingModeSwitch(nextMode === 'automatic' ? 'to_automatic' : 'to_manual');
      return;
    }
    form.setValue('membership_mode', nextMode, { shouldDirty: true });
  };

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      form.reset();
      onOpenChange(false);
    },
  });

  const selectedBrandIds = form.watch('allowed_tenant_brand_ids') ?? [];
  const selectedBuyerIds = form.watch('selected_buyer_ids') ?? [];
  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter((brand) =>
      [brand.display_name_override, brand.master_brand?.name, brand.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [brandSearch, brands]);
  const selectedBrandNames = useMemo(
    () => brands
      .filter((brand) => selectedBrandIds.includes(brand.id))
      .map((brand) => brand.display_name_override ?? brand.master_brand?.name ?? 'Unnamed brand'),
    [brands, selectedBrandIds],
  );
  const buyerQuery = useCohortComposerBuyers({
    query: buyerSearch,
    limit: 30,
    enabled: buyerPickerOpen && membershipMode === 'manual',
  });
  const buyerRows = useMemo(
    () => buyerQuery.data?.pages.flatMap((page) => page.buyers) ?? [],
    [buyerQuery.data?.pages],
  );
  const buyerCache = useMemo(() => new Map(buyerRows.map((buyer) => [buyer.id, buyer])), [buyerRows]);
  const selectedBuyerSet = useMemo(() => new Set(selectedBuyerIds), [selectedBuyerIds]);
  const selectedBuyerSummary = useMemo(() => {
    if (selectedBuyerIds.length === 0) return 'Select buyers';
    const first = buyerCache.get(selectedBuyerIds[0]);
    const head = first?.business_name ?? 'Selected buyer';
    return selectedBuyerIds.length === 1 ? head : `${head} +${selectedBuyerIds.length - 1} more`;
  }, [buyerCache, selectedBuyerIds]);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: buyerQuery.hasNextPage ?? false,
    isLoading: buyerQuery.isFetchingNextPage,
    rootMargin: '240px',
    onLoadMore: () => {
      void buyerQuery.fetchNextPage();
    },
  });

  function toggleBuyer(buyerId: string) {
    form.setValue(
      'selected_buyer_ids',
      selectedBuyerSet.has(buyerId)
        ? selectedBuyerIds.filter((id) => id !== buyerId)
        : [...selectedBuyerIds, buyerId],
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    );
  }

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Segmentation"
          title={mode === 'edit' ? 'Edit customer group' : 'Add a customer group'}
          description="Define the group details, then choose how buyers are targeted."
        />
        <FormOverlayBody className="space-y-5">
          <Form {...form}>
            <form
              id="customer-group-form"
              className="space-y-5"
              onSubmit={form.handleSubmit(async (values) => {
                await mutation.mutateAsync(values);
                form.reset();
                onOpenChange(false);
              })}
            >
              <FormBlock title="Details">
                <FormSectionGrid columns={1}>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Retailers South" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} placeholder="Who this group is for" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />


<FormField
                  control={form.control}
                  name="allowed_tenant_brand_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed brands</FormLabel>
                      <FormControl>
                        <SearchOverlayPicker
                          open={brandPickerOpen}
                          onOpenChange={(next) => {
                            setBrandPickerOpen(next);
                            if (!next) setBrandSearch('');
                          }}
                          title="Select brands"
                          triggerTitle={selectedBrandNames.length > 0 ? selectedBrandNames.join(', ') : 'All brands'}
                          triggerDescription={selectedBrandNames.length > 0 ? `${selectedBrandNames.length} brand${selectedBrandNames.length === 1 ? '' : 's'} selected` : 'Leave unrestricted or choose one or more brands'}
                          searchValue={brandSearch}
                          onSearchValueChange={setBrandSearch}
                          searchPlaceholder="Search brands…"
                          footer={(
                            <div className="flex items-center justify-end gap-2">
                              <Button type="button" variant="ghost" onClick={() => setBrandPickerOpen(false)}>
                                Cancel
                              </Button>
                              <Button type="button" onClick={() => setBrandPickerOpen(false)}>
                                <Check className="h-3.5 w-3.5" />
                                {`Select ${selectedBrandIds.length} brands`}
                              </Button>
                            </div>
                          )}
                        >
                          {selectedBrandNames.length > 0 ? (
                            <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Selected brands</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedBrandIds.map((brandId) => {
                                  const brand = brands.find((entry) => entry.id === brandId);
                                  if (!brand) return null;
                                  const label = brand.display_name_override ?? brand.master_brand?.name ?? 'Unnamed brand';
                                  return (
                                    <button
                                      key={brandId}
                                      type="button"
                                      onClick={() => field.onChange(selectedBrandIds.filter((id) => id !== brandId))}
                                      className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100"
                                    >
                                      <span>{label}</span>
                                      <span aria-hidden="true" className="text-teal-700">×</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          <div className="overflow-hidden rounded-[8px] border border-cream-200 bg-white">
                            <button
                              type="button"
                              onClick={() => field.onChange([])}
                              className="flex w-full items-center justify-between border-b border-cream-200 px-3 py-[10px] text-left transition-colors hover:bg-cream-50"
                            >
                              <div className="min-w-0">
                                <p className="text-base font-medium text-cream-900">All brands</p>
                                <p className="text-sm text-cream-700">No brand restriction</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                {selectedBrandIds.length === 0 ? 'Selected' : 'Add'}
                              </span>
                            </button>
                            {filteredBrands.map((brand) => {
                              const title = brand.display_name_override ?? brand.master_brand?.name ?? 'Unnamed brand';
                              const selected = selectedBrandIds.includes(brand.id);
                              return (
                                <button
                                  key={brand.id}
                                  type="button"
                                  onClick={() => field.onChange(
                                    selected
                                      ? selectedBrandIds.filter((id) => id !== brand.id)
                                      : [...selectedBrandIds, brand.id],
                                  )}
                                  className={[
                                    'flex w-full items-center justify-between border-b border-cream-200 px-3 py-[10px] text-left transition-colors last:border-b-0',
                                    selected ? 'border-ember-100 bg-ember-50' : 'hover:bg-cream-50',
                                  ].join(' ')}
                                >
                                  <div className="min-w-0">
                                    <p className="text-base font-medium text-cream-900">{title}</p>
                                    {brand.description ? <p className="text-sm text-cream-700">{brand.description}</p> : null}
                                  </div>
                                  <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                    {selected ? 'Selected' : 'Add'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </SearchOverlayPicker>
                      </FormControl>
                      <p className="text-sm text-cream-600">Optionally limit this customer group to one or more brands.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />


                </FormSectionGrid>
              </FormBlock>

              <FormBlock title="Targeting">
                <FormField
                  control={form.control}
                  name="membership_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buyer selection mode</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => requestModeChange(value as 'manual' | 'automatic')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select buyer selection mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="manual">Manual selection</SelectItem>
                          <SelectItem value="automatic">Automatic filters</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-cream-600">
                        {membershipMode === 'automatic'
                          ? 'Members are computed from the filters below and kept up to date automatically.'
                          : 'Pick the exact buyers that should belong to this customer group.'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {membershipMode === 'manual' ? (
                  <FormField
                    control={form.control}
                    name="selected_buyer_ids"
                    render={() => (
                      <FormItem>
                        <FormLabel>Buyer selection</FormLabel>
                        <SearchOverlayPicker
                          open={buyerPickerOpen}
                          onOpenChange={(next) => {
                            setBuyerPickerOpen(next);
                            if (!next) setBuyerSearch('');
                          }}
                          title="Select buyers"
                          eyebrow="Segmentation"
                          description="Choose the buyers that should be included in this customer group."
                          triggerTitle={selectedBuyerSummary}
                          triggerDescription={selectedBuyerIds.length > 0 ? `${selectedBuyerIds.length} buyers selected` : 'Search and add buyers to this group'}
                          searchValue={buyerSearch}
                          onSearchValueChange={setBuyerSearch}
                          searchPlaceholder="Search buyers…"
                          footer={(
                            <div className="flex items-center justify-end gap-2">
                              <Button type="button" variant="ghost" onClick={() => setBuyerPickerOpen(false)}>
                                Cancel
                              </Button>
                              <Button type="button" onClick={() => setBuyerPickerOpen(false)}>
                                <Check className="h-3.5 w-3.5" />
                                {`Select ${selectedBuyerIds.length} buyers`}
                              </Button>
                            </div>
                          )}
                        >
                          {selectedBuyerIds.length > 0 ? (
                            <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Selected buyers</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedBuyerIds.map((buyerId) => {
                                  const buyer = buyerCache.get(buyerId);
                                  return (
                                    <button
                                      key={buyerId}
                                      type="button"
                                      onClick={() => toggleBuyer(buyerId)}
                                      className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100"
                                    >
                                      <span>{buyer?.business_name ?? 'Selected buyer'}</span>
                                      <span aria-hidden="true" className="text-teal-700">×</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          {buyerQuery.isFetching && buyerRows.length === 0 ? (
                            <div className="space-y-1">
                              {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={idx} className="h-12 animate-pulse rounded-[8px] bg-cream-100" />
                              ))}
                            </div>
                          ) : buyerRows.length > 0 ? (
                            <div className="space-y-0.5">
                              {buyerRows.map((buyer) => {
                                const selected = selectedBuyerSet.has(buyer.id);
                                return (
                                  <button
                                    key={buyer.id}
                                    type="button"
                                    onClick={() => toggleBuyer(buyer.id)}
                                    className={[
                                      'flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-left transition-colors',
                                      selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                                    ].join(' ')}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-base font-medium text-cream-900">{buyer.business_name}</p>
                                      <p className="mt-0.5 text-sm text-cream-700">
                                        {buyer.geography_label}
                                        {buyer.tier ? ` · Tier ${buyer.tier}` : ''}
                                      </p>
                                    </div>
                                    <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                      {selected ? 'Selected' : 'Add'}
                                    </span>
                                  </button>
                                );
                              })}
                              {buyerQuery.hasNextPage ? <div ref={sentinelRef} className="h-4" /> : null}
                            </div>
                          ) : (
                            <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                              No buyers match this search.
                            </p>
                          )}
                        </SearchOverlayPicker>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="rules"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <MembershipFilterPanel
                          entityType="cohort"
                          rules={field.value ?? {}}
                          onRulesChange={field.onChange}
                        />
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
          <Button type="button" variant="outline" onClick={() => dirtyGuard.handleOpenChange(false)}>
            Cancel
          </Button>
          <MutationButton type="submit" form="customer-group-form" isPending={mutation.isPending} pendingLabel="Saving…">
            {mode === 'edit' ? 'Save changes' : 'Create customer group'}
          </MutationButton>
        </FormOverlayFooter>
      </FormOverlay>
      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />
      <MembershipModeSwitchDialog
        open={pendingModeSwitch !== null}
        onOpenChange={(next) => {
          if (!next) setPendingModeSwitch(null);
        }}
        direction={pendingModeSwitch ?? 'to_automatic'}
        affectedCount={affectedMemberCount}
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
