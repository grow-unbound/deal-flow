'use client';

import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CampaignFormPayloadSchema, type CampaignFormPayload } from '@/lib/zod';
import { isoDateString } from '@/lib/date-utils';
import { useTenantCohortOptions } from '@/hooks/useCohorts';
import { useSaveSimpleCatalog } from '@/hooks/useCatalogs';
import { usePriceLists } from '@/hooks/usePriceLists';
import { BrowseUploadField } from '@/components/ui/browse-upload-field';
import { uploadEntityFile } from '@/lib/upload-client';
import { Switch } from '@/components/ui/switch';

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

  const targetMode = form.watch('target_mode');
  const pricingMode = form.watch('pricing_mode');

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Growth"
          title={mode === 'edit' ? 'Edit campaign' : 'Add a campaign'}
          description="Keep setup lightweight here. Buyers, products, and individual pricing stay in the campaign detail tabs."
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
              <FormBlock>
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
                    <div className="flex items-center justify-between rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-cream-900">Target by customer group</p>
                        <p className="text-sm text-cream-600">Turn off to manage individual buyers in Campaign Details.</p>
                      </div>
                      <Switch
                        checked={targetMode === 'customer_group'}
                        onCheckedChange={(checked) => form.setValue('target_mode', checked ? 'customer_group' : 'individual_buyers', { shouldDirty: true })}
                        className={targetMode === 'customer_group' ? 'bg-ember-300' : 'bg-cream-300'}
                      />
                    </div>

                    {targetMode === 'customer_group' ? (
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
                    ) : (
                      <p className="text-sm text-cream-600">Select and manage individual buyers from Campaign Details {'->'} Buyers after this campaign is saved.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-cream-900">Use pricelist</p>
                        <p className="text-sm text-cream-600">Turn off to manage individual campaign prices in Campaign Details.</p>
                      </div>
                      <Switch
                        checked={pricingMode === 'pricelist'}
                        onCheckedChange={(checked) => form.setValue('pricing_mode', checked ? 'pricelist' : 'individual_prices', { shouldDirty: true })}
                        className={pricingMode === 'pricelist' ? 'bg-ember-300' : 'bg-cream-300'}
                      />
                    </div>

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
    </>
  );
}
