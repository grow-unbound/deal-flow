'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
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
import { StackedPickerField, type PickerItem } from '@/components/ui/stacked-picker-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { BuyerCreateSchema, type BuyerCreateInput } from '@/lib/zod';
import { INDIAN_STATES } from '@/constants';
import { apiFetch } from '@/lib/api-fetch';
import { formatNumberInput, parseNumberInput } from '@/lib/utils';
import { useCreateCustomerOptimistic } from '@/hooks/useCustomersLanding';
import { useTenantCohortOptions } from '@/hooks/useCohorts';
import { usePriceLists } from '@/hooks/usePriceLists';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useRole } from '@/hooks/useRole';
import { useBusinessPolicy } from '@/hooks/useBusinessPolicy';

function formatPriceListValidity(validFrom: string | null, validTo: string | null) {
  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : 'Open';

  return `${formatDate(validFrom)} → ${formatDate(validTo)}`;
}

export function AddCustomerDialog({
  open,
  onOpenChange,
  mode = 'create',
  customerId,
  defaultValues,
  assignedPriceListName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: 'create' | 'edit';
  customerId?: string;
  defaultValues?: Partial<BuyerCreateInput>;
  assignedPriceListName?: string | null;
}) {
  const createMutation = useCreateCustomerOptimistic();
  const queryClient = useQueryClient();
  const isEditMode = mode === 'edit' && !!customerId;
  const { isSellerAssistant } = useRole();
  const { creditEnabled } = useBusinessPolicy();

  const cohortsFlag = useFlagState('COHORTS');
  const cohortsEnabled = cohortsFlag === true;
  const { data: cohortOptions = [], isLoading: cohortsLoading } =
    useTenantCohortOptions(cohortsEnabled);
  const { data: priceListsResponse } = usePriceLists();
  const priceLists = priceListsResponse?.price_lists ?? [];
  const [priceListSearchOpen, setPriceListSearchOpen] = useState(false);
  const [priceListSearchQuery, setPriceListSearchQuery] = useState('');

  const cohortItems = useMemo<PickerItem[]>(
    () =>
      cohortOptions.map((c) => ({
        id: c.id,
        title: c.name,
        description: c.description,
        meta: `${c.member_count} buyers`,
      })),
    [cohortOptions],
  );

  const filteredPriceLists = useMemo(() => {
    const q = priceListSearchQuery.trim().toLowerCase();
    if (!q) return priceLists;
    return priceLists.filter((priceList) =>
      [priceList.name, priceList.description, priceList.pricing_strategy]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [priceListSearchQuery, priceLists]);

  const form = useForm<BuyerCreateInput>({
    resolver: zodResolver(BuyerCreateSchema),
    defaultValues: {
      business_name: '',
      contact_name: '',
      phone: '',
      email: '',
      gstin: '',
      credit_limit: 0,
      payment_terms_days: 0,
      default_cohort_id: null,
      default_price_list_id: null,
      buyer_app_enabled: false,
      geography: { city: '', state: '', pincode: '', zone: '' },
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      business_name: '',
      contact_name: '',
      phone: '',
      email: '',
      gstin: '',
      credit_limit: 0,
      payment_terms_days: 0,
      default_cohort_id: null,
      default_price_list_id: null,
      buyer_app_enabled: false,
      geography: { city: '', state: '', pincode: '', zone: '' },
      ...defaultValues,
    });
    setPriceListSearchOpen(false);
    setPriceListSearchQuery('');
  }, [defaultValues, form, open]);

  const selectedPriceListId = form.watch('default_price_list_id');
  const selectedPriceList = useMemo(
    () => priceLists.find((priceList) => priceList.id === selectedPriceListId) ?? null,
    [priceLists, selectedPriceListId],
  );

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      form.reset();
      onOpenChange(false);
    },
  });

  const {
    formState: { isSubmitting },
  } = form;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEditMode && customerId) {
        const res = await apiFetch(`/api/customers/${customerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? 'Failed to update buyer');
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['tenant-customers'] }),
          queryClient.invalidateQueries({ queryKey: ['tenant-customer-detail', customerId] }),
          queryClient.invalidateQueries({ queryKey: ['customer', customerId] }),
        ]);
        toast.success('Buyer updated');
      } else {
        await createMutation.mutateAsync(values);
        toast.success('Buyer added');
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEditMode
            ? 'Failed to update buyer'
            : 'Failed to create buyer',
      );
    }
  });

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Customers"
          title={isEditMode ? 'Edit buyer' : 'Add a buyer'}
          description={
            isEditMode
              ? 'Update the buyer details used in your workspace.'
              : 'You can add the Buyer team member after the buyer is created.'
          }
        />

        <FormOverlayBody className="space-y-5">
          <Form {...form}>
            <form id="add-buyer-form" onSubmit={onSubmit} className="space-y-5">

              {/* Identity */}
              <FormBlock title="Identity">
                <FormSectionGrid columns={2}>
                  <FormField
                    control={form.control}
                    name="business_name"
                    render={({ field }) => (
                      <FormItem className="space-y-2 md:col-span-2">
                        <FormLabel>
                          Business name <span className="text-ember-400">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Bharat Electronics" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="geography.city"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} placeholder="Gachibowli, Hyderabad" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="geography.state"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>State</FormLabel>
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {INDIAN_STATES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="geography.pincode"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Pincode</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            placeholder="500032"
                            maxLength={6}
                            className="font-mono"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="geography.zone"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Zone</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} placeholder="West / North / South" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </FormSectionGrid>
              </FormBlock>

              {/* Primary contact */}
              <FormBlock title="Primary contact">
                <FormSectionGrid columns={2}>
                  <FormField
                    control={form.control}
                    name="contact_name"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} placeholder="Full name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>
                          Phone <span className="text-ember-400">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="flex items-stretch">
                            <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-3 text-base text-cream-700">
                              +91
                            </span>
                            <Input
                              {...field}
                              type="tel"
                              inputMode="numeric"
                              placeholder="9876543210"
                              maxLength={10}
                              className="rounded-l-none font-mono tracking-wide"
                              onChange={(e) => {
                                field.onChange(e.target.value.replace(/\D/g, '').slice(0, 10));
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-2 md:col-span-2">
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            type="email"
                            placeholder="abc@gmail.com"
                            className="font-mono"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSectionGrid>
              </FormBlock>

              {/* Tax & terms */}
              <FormBlock title="Tax & terms">
                <FormSectionGrid columns={2}>
                  <FormField
                    control={form.control}
                    name="gstin"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>GSTIN</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            placeholder="07AABCV1234L1Z5"
                            className="font-mono uppercase"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="default_price_list_id"
                    render={({ field }) => (
                      <FormItem className="space-y-2 md:col-span-2">
                        <FormLabel>Default pricelist</FormLabel>
                        <FormControl>
                          <SearchOverlayPicker
                            open={priceListSearchOpen}
                            onOpenChange={(next) => {
                              setPriceListSearchOpen(next);
                              if (!next) {
                                setPriceListSearchQuery('');
                              }
                            }}
                            title="Pick a pricelist"
                            eyebrow="Pricing"
                            description="Set the buyer-specific default pricelist assignment."
                            triggerTitle={
                              selectedPriceList?.name
                              ?? assignedPriceListName
                              ?? (selectedPriceListId ? 'Assigned pricelist' : 'Select pricelist')
                            }
                            triggerDescription={
                              selectedPriceList
                                ? formatPriceListValidity(selectedPriceList.valid_from, selectedPriceList.valid_to)
                                : 'This will become the buyer-specific default.'
                            }
                            searchValue={priceListSearchQuery}
                            onSearchValueChange={setPriceListSearchQuery}
                            searchPlaceholder="Search pricelists…"
                            loading={!priceListsResponse}
                            className="max-w-[540px]"
                          >
                            {filteredPriceLists.length > 0 ? (
                              <div className="space-y-0.5">
                                {filteredPriceLists.map((priceList) => {
                                  const selected = field.value === priceList.id;
                                  return (
                                    <button
                                      key={priceList.id}
                                      type="button"
                                      onClick={() => {
                                        field.onChange(priceList.id);
                                        setPriceListSearchOpen(false);
                                      }}
                                      className={[
                                        'flex w-full items-start justify-between rounded-[8px] px-3 py-2 text-left transition-colors',
                                        selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                                      ].join(' ')}
                                    >
                                      <div className="min-w-0">
                                        <p className="text-base font-medium text-cream-900">{priceList.name}</p>
                                        <p className="mt-0.5 text-sm text-cream-700">
                                          {priceList.description ?? formatPriceListValidity(priceList.valid_from, priceList.valid_to)}
                                        </p>
                                      </div>
                                      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                        {selected ? 'Selected' : 'Choose'}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : priceListSearchQuery.trim() ? (
                              <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                                No pricelists match this search.
                              </p>
                            ) : (
                              <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                                Start typing to search pricelists.
                              </p>
                            )}
                          </SearchOverlayPicker>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {creditEnabled && !isSellerAssistant ? (
                    <FormField
                      control={form.control}
                      name="credit_limit"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Credit limit</FormLabel>
                          <FormControl>
                            <div className="flex items-stretch">
                              <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-3 text-base text-cream-700 select-none">
                                ₹
                              </span>
                              <Input
                                value={field.value ? formatNumberInput(String(field.value), 'CURRENCY_EXACT') : ''}
                                onChange={(e) => field.onChange(parseNumberInput(formatNumberInput(e.target.value, 'CURRENCY_EXACT'), 'CURRENCY_EXACT') ?? 0)}
                                placeholder="0"
                                className="rounded-l-none font-mono tabular-nums tracking-wide"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}

                  <FormField
                    control={form.control}
                    name="payment_terms_days"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Net payment days</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            className="font-mono"
                            value={field.value === 0 ? '' : String(field.value)}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '');
                              field.onChange(digits === '' ? 0 : Number(digits));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSectionGrid>
              </FormBlock>

              {/* Customer group */}
              {cohortsEnabled && !isSellerAssistant ? (
                <FormBlock title="Customer group">
                  <FormField
                    control={form.control}
                    name="default_cohort_id"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Customer group</FormLabel>
                        <FormControl>
                          {cohortsLoading ? (
                            <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
                          ) : (
                            <StackedPickerField
                              title="Pick a customer group"
                              items={cohortItems}
                              selectedId={field.value}
                              onSelect={field.onChange}
                              mode="stacked"
                              searchPlaceholder="Search customer groups…"
                              emptyLabel="No customer groups match."
                            />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormBlock>
              ) : null}

              {/* Buyer App */}
              <FormBlock title="Buyer App">
                <FormField
                  control={form.control}
                  name="buyer_app_enabled"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <FormLabel className="text-base">Enable buyer app access</FormLabel>
                          <p className="mt-0.5 text-sm text-cream-500">
                            Allow this buyer to log in and place orders via the buyer app.
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </FormBlock>

            </form>
          </Form>
        </FormOverlayBody>

        <FormOverlayFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => dirtyGuard.handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-buyer-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : isEditMode ? 'Save changes' : 'Create'}
          </Button>
        </FormOverlayFooter>
      </FormOverlay>

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />
    </>
  );
}
