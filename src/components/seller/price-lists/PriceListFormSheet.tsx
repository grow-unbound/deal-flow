'use client';

import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { MutationButton } from '@/components/ui/mutation-button';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MembershipFilterPanel } from '@/components/seller/shared/MembershipFilterPanel';
import {
  MembershipModeSwitchDialog,
  type MembershipModeSwitchDirection,
} from '@/components/seller/shared/MembershipModeSwitchDialog';
import { isoDateString } from '@/lib/date-utils';
import { PriceListFormPayloadSchema, type PriceListFormPayload } from '@/lib/zod';
import { useSaveSimplePriceList } from '@/hooks/usePriceLists';

const MEMBERSHIP_MODE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
];

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
  const form = useForm<PriceListFormPayload>({
    resolver: zodResolver(PriceListFormPayloadSchema),
    defaultValues: {
      form_mode: 'simple',
      name: '',
      description: '',
      valid_from: new Date(),
      priority: 0,
      membership_mode: 'manual',
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
  const initialMembershipMode = defaultValues?.membership_mode ?? 'manual';

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
              <FormBlock>
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
              <FormBlock>
                <FormItem>
                  <FormLabel>Membership</FormLabel>
                  <SegmentedControl
                    aria-label="Membership mode"
                    options={MEMBERSHIP_MODE_OPTIONS}
                    allowClear={false}
                    value={membershipMode}
                    onChange={(value) => requestModeChange(value as 'manual' | 'automatic')}
                  />
                  <p className="text-sm text-cream-600">
                    {membershipMode === 'automatic'
                      ? 'Products are computed from the filters below and kept up to date automatically.'
                      : 'Products are picked by hand in the detail tabs.'}
                  </p>
                </FormItem>
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
                ) : null}
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
