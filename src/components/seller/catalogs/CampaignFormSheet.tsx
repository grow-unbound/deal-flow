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
import { MutationButton } from '@/components/ui/mutation-button';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { StackedPickerField, type PickerItem } from '@/components/ui/stacked-picker-field';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CampaignFormPayloadSchema, type CampaignFormPayload } from '@/lib/zod';
import { isoDateString } from '@/lib/date-utils';
import { useTenantCohortOptions } from '@/hooks/useCohorts';
import { useCatalogComposerBuyerPicker, useCatalogComposerProducts, useSaveSimpleCatalog } from '@/hooks/useCatalogs';
import { usePriceLists } from '@/hooks/usePriceLists';
import { BrowseUploadField } from '@/components/ui/browse-upload-field';
import { uploadEntityFile } from '@/lib/upload-client';
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
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface CampaignFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  campaignId?: string;
  defaultValues?: Partial<CampaignFormPayload>;
}

export function CampaignFormSheet({ open, onOpenChange, mode, campaignId, defaultValues }: CampaignFormSheetProps) {
  const mutation = useSaveSimpleCatalog(campaignId);
  const [heroUrls, setHeroUrls] = useState<string[]>([]);
  const [stagedHeroFile, setStagedHeroFile] = useState<File | null>(null);
  const { data: cohortOptions = [] } = useTenantCohortOptions(true);
  const { data: priceListData } = usePriceLists();
  const [buyerPickerOpen, setBuyerPickerOpen] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const cohortItems = useMemo<PickerItem[]>(
    () => cohortOptions.map((cohort) => ({
      id: cohort.id,
      title: cohort.name,
      description: cohort.description,
      meta: `${cohort.member_count} buyers`,
    })),
    [cohortOptions],
  );

  const priceListItems = useMemo<PickerItem[]>(
    () => (priceListData?.price_lists ?? []).map((priceList) => ({
      id: priceList.id,
      title: priceList.name,
      description: priceList.description,
    })),
    [priceListData?.price_lists],
  );

  const [pendingBuyerTargetMode, setPendingBuyerTargetMode] = useState<'manual' | 'automatic' | 'customer_group' | null>(null);
  const [pendingProductModeSwitch, setPendingProductModeSwitch] = useState<MembershipModeSwitchDirection | null>(null);

  const form = useForm<CampaignFormPayload>({
    resolver: zodResolver(CampaignFormPayloadSchema),
    defaultValues: {
      form_mode: 'simple',
      name: '',
      description: '',
      valid_from: new Date(),
      buyer_note: '',
      hero_image_url: '',
      target_mode: 'customer_group',
      pricing_mode: 'individual_prices',
      buyer_target_mode: 'customer_group',
      buyer_ids: [],
      product_membership_mode: 'manual',
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
      buyer_note: '',
      hero_image_url: '',
      target_mode: 'customer_group',
      pricing_mode: 'individual_prices',
      buyer_target_mode: 'customer_group',
      buyer_ids: [],
      product_membership_mode: 'manual',
      selected_product_ids: [],
      ...defaultValues,
    });
    setHeroUrls(defaultValues?.hero_image_url ? [defaultValues.hero_image_url] : []);
    setStagedHeroFile(null);
  }, [defaultValues, form, open]);

  useEffect(() => {
    return () => {
      heroUrls.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [heroUrls]);

  const defaultHeroUrl = defaultValues?.hero_image_url ?? '';
  const currentHeroUrl = heroUrls[0] ?? '';

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty || stagedHeroFile !== null || currentHeroUrl !== defaultHeroUrl,
    onConfirmClose: () => {
      heroUrls.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      form.reset();
      setHeroUrls([]);
      setStagedHeroFile(null);
      onOpenChange(false);
    },
  });

  const pricingMode = form.watch('pricing_mode');
  const buyerTargetMode = form.watch('buyer_target_mode') ?? 'customer_group';
  const selectedBuyerIds = form.watch('buyer_ids') ?? [];
  const productMembershipMode = form.watch('product_membership_mode') ?? 'manual';
  const selectedProductIds = form.watch('selected_product_ids') ?? [];
  const initialBuyerTargetMode = defaultValues?.buyer_target_mode ?? 'customer_group';
  const initialProductMembershipMode = defaultValues?.product_membership_mode ?? 'manual';
  const buyerPickerQuery = useCatalogComposerBuyerPicker({
    query: buyerSearch,
    selectedIds: selectedBuyerIds,
    enabled: buyerPickerOpen && buyerTargetMode === 'manual',
  });
  const buyerRows = useMemo(
    () => buyerPickerQuery.data?.pages.flatMap((page) => page.buyers) ?? [],
    [buyerPickerQuery.data?.pages],
  );
  const buyerMap = useMemo(() => new Map(buyerRows.map((buyer) => [buyer.id, buyer])), [buyerRows]);
  const selectedBuyerSet = useMemo(() => new Set(selectedBuyerIds), [selectedBuyerIds]);
  const selectedBuyerSummary = useMemo(() => {
    if (selectedBuyerIds.length === 0) return 'Select buyers';
    const first = buyerMap.get(selectedBuyerIds[0]);
    return `${first?.business_name ?? 'Selected buyer'}${selectedBuyerIds.length > 1 ? ` +${selectedBuyerIds.length - 1} more` : ''}`;
  }, [buyerMap, selectedBuyerIds]);
  const productQuery = useCatalogComposerProducts({ query: productSearch, limit: 30 }, productPickerOpen && productMembershipMode === 'manual');
  const productRows = useMemo(
    () => productQuery.data?.pages.flatMap((page) => page.products) ?? [],
    [productQuery.data?.pages],
  );
  const productMap = useMemo(() => new Map(productRows.map((product) => [product.id, product])), [productRows]);
  const selectedProductSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const selectedProductSummary = useMemo(() => {
    if (selectedProductIds.length === 0) return 'Select products';
    const first = productMap.get(selectedProductIds[0]);
    return `${first?.display_name ?? 'Selected product'}${selectedProductIds.length > 1 ? ` +${selectedProductIds.length - 1} more` : ''}`;
  }, [productMap, selectedProductIds]);
  const { sentinelRef: buyerSentinelRef } = useInfiniteScroll({
    hasMore: buyerPickerQuery.hasNextPage ?? false,
    isLoading: buyerPickerQuery.isFetchingNextPage,
    rootMargin: '240px',
    onLoadMore: () => {
      void buyerPickerQuery.fetchNextPage();
    },
  });
  const { sentinelRef: productSentinelRef } = useInfiniteScroll({
    hasMore: productQuery.hasNextPage ?? false,
    isLoading: productQuery.isFetchingNextPage,
    rootMargin: '240px',
    onLoadMore: () => {
      void productQuery.fetchNextPage();
    },
  });

  const requestBuyerModeChange = (nextMode: 'manual' | 'automatic' | 'customer_group') => {
    if (mode === 'edit' && nextMode !== initialBuyerTargetMode) {
      setPendingBuyerTargetMode(nextMode);
      return;
    }
    form.setValue('buyer_target_mode', nextMode, { shouldDirty: true });
    form.setValue('target_mode', nextMode === 'customer_group' ? 'customer_group' : 'individual_buyers', { shouldDirty: true });
  };

  const requestProductModeChange = (nextMode: 'manual' | 'automatic') => {
    if (mode === 'edit' && nextMode !== initialProductMembershipMode) {
      setPendingProductModeSwitch(nextMode === 'automatic' ? 'to_automatic' : 'to_manual');
      return;
    }
    form.setValue('product_membership_mode', nextMode, { shouldDirty: true });
  };

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Growth"
          title={mode === 'edit' ? 'Edit campaign' : 'Add a campaign'}
          description="Setup targeted campaigns for select products."
        />
        <FormOverlayBody className="space-y-5">
          <Form {...form}>
            <form
              id="campaign-form"
              className="space-y-5"
              onSubmit={form.handleSubmit(async (values) => {
                const result = await mutation.mutateAsync({
                  ...values,
                  hero_image_url: stagedHeroFile ? '' : (heroUrls[0] ?? values.hero_image_url ?? ''),
                });

                if (stagedHeroFile) {
                  await uploadEntityFile({
                    endpoint: '/api/upload/catalog-hero',
                    entityType: 'catalog_hero',
                    entityId: result.catalog.id,
                    file: stagedHeroFile,
                  });
                }

                heroUrls.forEach((url) => {
                  if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                  }
                });
                form.reset();
                setHeroUrls([]);
                setStagedHeroFile(null);
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
                          <Textarea {...field} rows={1} placeholder="August retail push" className="min-h-0 resize-none" />
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
                          <Textarea {...field} rows={3} placeholder="Internal description for the team" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="valid_from"
                      render={({ field }) => (
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
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="valid_to"
                      render={({ field }) => (
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
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="hero_image_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign hero image</FormLabel>
                        <FormControl>
                          <BrowseUploadField
                            value={heroUrls}
                            onChange={(urls) => {
                              setHeroUrls(urls);
                              field.onChange(urls[0] ?? '');
                            }}
                            maxFiles={1}
                            uploadFile={async (file) => {
                              if (campaignId) {
                                const response = await uploadEntityFile({
                                  endpoint: '/api/upload/catalog-hero',
                                  entityType: 'catalog_hero',
                                  entityId: campaignId,
                                  file,
                                });
                                const uploadedUrl = response.urls.medium ?? response.urls.original;
                                if (!uploadedUrl) {
                                  throw new Error('Image upload succeeded but no campaign image URL was returned.');
                                }
                                setStagedHeroFile(null);
                                return uploadedUrl;
                              }

                              setStagedHeroFile(file);
                              return URL.createObjectURL(file);
                            }}
                            previewInline
                            emptyLabel="Drop an image here or browse"
                            helperText="800×418 recommended. JPG, PNG, WebP · Max 5MB."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="buyer_note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Buyer note</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} placeholder="Short note shown to buyers" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

<div className="space-y-2">
                    <FormField
                      control={form.control}
                      name="pricing_mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pricing source</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(value) => form.setValue('pricing_mode', value as 'pricelist' | 'individual_prices', { shouldDirty: true })}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select pricing source" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="individual_prices">Campaign-specific pricing</SelectItem>
                              <SelectItem value="pricelist">Use an existing pricelist</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-cream-600">
                            {pricingMode === 'pricelist'
                              ? 'Apply one saved pricelist to this campaign.'
                              : 'Use campaign-specific product pricing and overrides.'}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {pricingMode === 'pricelist' ? (
                      <FormField
                        control={form.control}
                        name="price_list_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pricelist</FormLabel>
                            <FormControl>
                              <StackedPickerField
                                title="Pick a pricelist"
                                items={priceListItems}
                                mode="stacked"
                                selectedId={field.value ?? null}
                                onSelect={field.onChange}
                                searchPlaceholder="Search pricelists…"
                                emptyTitle="Select pricelist"
                                emptyDescription="Choose which pricelist powers this campaign"
                                nullOptionLabel="No pricelist"
                                nullOptionDescription="Manage campaign-specific pricing from the detail tabs instead."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <p className="text-sm text-cream-600">Select products and set individual prices from the campaign detail tabs after this campaign is saved.</p>
                    )}
                  </div>


                </FormSectionGrid>
              </FormBlock>

              <FormBlock title="Targeting">
                <FormField
                  control={form.control}
                  name="buyer_target_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buyer targeting</FormLabel>
                      <Select
                        value={field.value ?? buyerTargetMode}
                        onValueChange={(value) => requestBuyerModeChange(value as 'manual' | 'automatic' | 'customer_group')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select buyer targeting mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="customer_group">Customer group</SelectItem>
                          <SelectItem value="manual">Manual buyer selection</SelectItem>
                          <SelectItem value="automatic">Automatic filters</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-cream-600">
                        {buyerTargetMode === 'customer_group'
                          ? 'Target one saved customer group.'
                          : buyerTargetMode === 'automatic'
                            ? 'Target buyers who match the filters below.'
                            : 'Pick the exact buyers that should receive this campaign.'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                    {buyerTargetMode === 'customer_group' ? (
                      <FormField
                        control={form.control}
                        name="target_cohort_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Customer group</FormLabel>
                            <FormControl>
                              <StackedPickerField
                                title="Pick a customer group"
                                items={cohortItems}
                                mode="stacked"
                                selectedId={field.value ?? null}
                                onSelect={field.onChange}
                                searchPlaceholder="Search customer groups…"
                                emptyTitle="Select customer group"
                                emptyDescription="Choose which customer group this campaign targets"
                                nullOptionLabel="No customer group"
                                nullOptionDescription="Manage individual buyers from Campaign Details instead."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : buyerTargetMode === 'automatic' ? (
                      <FormField
                        control={form.control}
                        name="buyer_rules"
                        render={({ field }) => (
                          <FormItem>
                            <MembershipFilterPanel
                              entityType="campaign_buyers"
                              rules={field.value ?? {}}
                              onRulesChange={field.onChange}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="buyer_ids"
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
                              eyebrow="Growth"
                              description="Choose the buyers that should receive this campaign."
                              triggerTitle={selectedBuyerSummary}
                              triggerDescription={selectedBuyerIds.length > 0 ? `${selectedBuyerIds.length} buyers selected` : 'Search and add buyers'}
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
                                      const buyer = buyerMap.get(buyerId);
                                      return (
                                        <button
                                          key={buyerId}
                                          type="button"
                                          onClick={() => form.setValue('buyer_ids', selectedBuyerIds.filter((id) => id !== buyerId), { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
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
                              {buyerPickerQuery.isFetching && buyerRows.length === 0 ? (
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
                                        onClick={() => form.setValue(
                                          'buyer_ids',
                                          selected
                                            ? selectedBuyerIds.filter((id) => id !== buyer.id)
                                            : [...selectedBuyerIds, buyer.id],
                                          { shouldDirty: true, shouldTouch: true, shouldValidate: true },
                                        )}
                                        className={[
                                          'flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-left transition-colors',
                                          selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                                        ].join(' ')}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-base font-medium text-cream-900">{buyer.business_name}</p>
                                          <p className="mt-0.5 text-sm text-cream-700">
                                            {buyer.city ?? 'Unknown city'}
                                            {` · ₹${Math.round(buyer.spend_mtd).toLocaleString('en-IN')} spend MTD`}
                                          </p>
                                        </div>
                                        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                          {selected ? 'Selected' : 'Add'}
                                        </span>
                                      </button>
                                    );
                                  })}
                                  {buyerPickerQuery.hasNextPage ? <div ref={buyerSentinelRef} className="h-4" /> : null}
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
                    )}
                  </div>

                  <div className="space-y-2">
                    <FormField
                      control={form.control}
                      name="product_membership_mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product selection mode</FormLabel>
                          <Select
                            value={field.value ?? productMembershipMode}
                            onValueChange={(value) => requestProductModeChange(value as 'manual' | 'automatic')}
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
                            {productMembershipMode === 'automatic'
                              ? 'Products are computed from the filters below and kept up to date automatically.'
                              : 'Pick the exact products that should appear in this campaign.'}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {productMembershipMode === 'automatic' ? (
                      <FormField
                        control={form.control}
                        name="product_rules"
                        render={({ field }) => (
                          <FormItem>
                            <MembershipFilterPanel
                              entityType="campaign_products"
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
                              eyebrow="Growth"
                              description="Choose the products that should be included in this campaign."
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
                              {productQuery.isFetching && productRows.length === 0 ? (
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
                                  {productQuery.hasNextPage ? <div ref={productSentinelRef} className="h-4" /> : null}
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
                  </div>
              </FormBlock>
            </form>
          </Form>
        </FormOverlayBody>
        <FormOverlayFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => dirtyGuard.handleOpenChange(false)}>
            Cancel
          </Button>
          <MutationButton type="submit" form="campaign-form" isPending={mutation.isPending} pendingLabel="Saving…">
            {mode === 'edit' ? 'Save changes' : 'Create campaign'}
          </MutationButton>
        </FormOverlayFooter>
      </FormOverlay>
      <DiscardChangesDialog open={dirtyGuard.discardOpen} onOpenChange={dirtyGuard.setDiscardOpen} onDiscard={dirtyGuard.confirmDiscard} />
      <MembershipModeSwitchDialog
        open={pendingBuyerTargetMode !== null}
        onOpenChange={(next) => {
          if (!next) setPendingBuyerTargetMode(null);
        }}
        direction={pendingBuyerTargetMode === 'automatic' ? 'to_automatic' : 'to_manual'}
        affectedCount={0}
        onConfirm={() => {
          if (pendingBuyerTargetMode) {
            form.setValue('buyer_target_mode', pendingBuyerTargetMode, { shouldDirty: true });
            form.setValue('target_mode', pendingBuyerTargetMode === 'customer_group' ? 'customer_group' : 'individual_buyers', { shouldDirty: true });
          }
          setPendingBuyerTargetMode(null);
        }}
      />
      <MembershipModeSwitchDialog
        open={pendingProductModeSwitch !== null}
        onOpenChange={(next) => {
          if (!next) setPendingProductModeSwitch(null);
        }}
        direction={pendingProductModeSwitch ?? 'to_automatic'}
        affectedCount={0}
        onConfirm={() => {
          if (pendingProductModeSwitch) {
            form.setValue('product_membership_mode', pendingProductModeSwitch === 'to_automatic' ? 'automatic' : 'manual', { shouldDirty: true });
          }
          setPendingProductModeSwitch(null);
        }}
      />
    </>
  );
}
