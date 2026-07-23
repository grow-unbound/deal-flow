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
import { Input } from '@/components/ui/input';
import { MutationButton } from '@/components/ui/mutation-button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MembershipFilterPanel } from '@/components/seller/shared/MembershipFilterPanel';
import {
  MembershipModeSwitchDialog,
  type MembershipModeSwitchDirection,
} from '@/components/seller/shared/MembershipModeSwitchDialog';
import { useTenantBrands } from '@/hooks/useBrands';
import { useSaveSimpleCustomerGroup } from '@/hooks/useCohorts';
import { CustomerGroupFormPayloadSchema, type CustomerGroupFormPayload } from '@/lib/zod';

const MEMBERSHIP_MODE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
];

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

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Segmentation"
          title={mode === 'edit' ? 'Edit customer group' : 'Add a customer group'}
          description="Update only the basic group details here. Members and rules stay in the detail experience."
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
              <FormBlock>
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
                </FormSectionGrid>
              </FormBlock>

              <FormBlock>
                <FormField
                  control={form.control}
                  name="allowed_tenant_brand_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed brands</FormLabel>
                      <FormControl>
                        <SearchOverlayPicker
                          open={brandPickerOpen}
                          onOpenChange={setBrandPickerOpen}
                          title="Select brands"
                          triggerTitle={selectedBrandNames.length > 0 ? selectedBrandNames.join(', ') : 'All brands'}
                          triggerDescription={selectedBrandNames.length > 0 ? `${selectedBrandNames.length} brand${selectedBrandNames.length === 1 ? '' : 's'} selected` : 'Leave unrestricted or choose one or more brands'}
                          searchValue={brandSearch}
                          onSearchValueChange={setBrandSearch}
                          searchPlaceholder="Search brands…"
                        >
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
                                  className="flex w-full items-center justify-between border-b border-cream-200 px-3 py-[10px] text-left transition-colors last:border-b-0 hover:bg-cream-50"
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
                      ? 'Members are computed from the filters below and kept up to date automatically.'
                      : 'Members are picked by hand in the detail experience.'}
                  </p>
                </FormItem>
                {membershipMode === 'automatic' ? (
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
                ) : null}
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
