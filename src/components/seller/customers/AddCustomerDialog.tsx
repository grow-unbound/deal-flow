'use client';

import { useEffect, useMemo } from 'react';
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
import { BuyerCreateSchema, type BuyerCreateInput } from '@/lib/zod';
import { INDIAN_STATES } from '@/constants';
import { apiFetch } from '@/lib/api-fetch';
import { formatInrInput, parseInrInput } from '@/lib/utils';
import { useCreateCustomerOptimistic } from '@/hooks/useCustomersLanding';
import { useTenantCohortOptions } from '@/hooks/useCohorts';
import { useFlagState } from '@/hooks/useFeatureFlag';

const TIER_OPTIONS = [
  { value: 'A' as const, label: 'Tier A' },
  { value: 'B' as const, label: 'Tier B' },
  { value: 'C' as const, label: 'Tier C' },
];

export function AddCustomerDialog({
  open,
  onOpenChange,
  mode = 'create',
  customerId,
  defaultValues,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: 'create' | 'edit';
  customerId?: string;
  defaultValues?: Partial<BuyerCreateInput>;
}) {
  const createMutation = useCreateCustomerOptimistic();
  const queryClient = useQueryClient();
  const isEditMode = mode === 'edit' && !!customerId;

  const cohortsFlag = useFlagState('COHORTS');
  const cohortsEnabled = cohortsFlag === true;
  const { data: cohortOptions = [], isLoading: cohortsLoading } =
    useTenantCohortOptions(cohortsEnabled);

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

  const form = useForm<BuyerCreateInput>({
    resolver: zodResolver(BuyerCreateSchema),
    defaultValues: {
      business_name: '',
      contact_name: '',
      phone: '',
      email: '',
      gstin: '',
      external_ref: '',
      tier: undefined,
      credit_limit: 0,
      payment_terms_days: 0,
      default_cohort_id: null,
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
      external_ref: '',
      tier: undefined,
      credit_limit: 0,
      payment_terms_days: 0,
      default_cohort_id: null,
      geography: { city: '', state: '', pincode: '', zone: '' },
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
              : 'You can add team members and shipping addresses after the buyer is created.'
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
                          <Input {...field} placeholder="Bharat Stores" />
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
                          <Input {...field} value={field.value ?? ''} placeholder="Karol Bagh, Delhi" />
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
                            placeholder="110005"
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

                  <FormField
                    control={form.control}
                    name="tier"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Tier</FormLabel>
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select tier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIER_OPTIONS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          <Input {...field} value={field.value ?? ''} placeholder="Suresh Bharat" />
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
                              placeholder="98101 22433"
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
                            placeholder="optional"
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
                    name="external_ref"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>ERP reference</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            placeholder="Tally / Zoho ledger code"
                            className="font-mono"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                              value={field.value ? formatInrInput(String(field.value)) : ''}
                              onChange={(e) => field.onChange(parseInrInput(formatInrInput(e.target.value)) ?? 0)}
                              placeholder="0"
                              className="rounded-l-none font-mono tabular-nums tracking-wide"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

              {/* Cohort */}
              {cohortsEnabled ? (
                <FormBlock title="Cohort">
                  <FormField
                    control={form.control}
                    name="default_cohort_id"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Cohort</FormLabel>
                        <FormControl>
                          {cohortsLoading ? (
                            <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
                          ) : (
                            <StackedPickerField
                              title="Pick a cohort"
                              items={cohortItems}
                              selectedId={field.value}
                              onSelect={field.onChange}
                              mode="inline"
                              searchPlaceholder="Search cohorts…"
                              emptyLabel="No cohorts match."
                            />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormBlock>
              ) : null}

            </form>
          </Form>
        </FormOverlayBody>

        <FormOverlayFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => dirtyGuard.handleOpenChange(false)}
          >
            Cancel
          </Button>
          <div className="flex-1" />
          <Button
            type="submit"
            form="add-buyer-form"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving…' : isEditMode ? 'Save changes' : 'Save buyer'}
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
