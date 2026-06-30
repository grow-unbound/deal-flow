'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Save, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  DiscardChangesDialog,
  FormOverlay,
  FormOverlayBody,
  FormOverlayFooter,
  FormOverlayHeader,
  useDirtyCloseGuard,
} from '@/components/ui/form-overlay';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import { InviteUserSchema, type InviteUserInput } from '@/lib/zod';
import { cn } from '@/lib/utils';
import type { TeamMember } from '@/types/team';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: TeamMember;
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '').slice(-10);
}

function mapServerFieldErrors(
  fieldErrors: Record<string, unknown>,
  setError: UseFormSetError<InviteUserInput>,
) {
  (Object.entries(fieldErrors) as Array<[keyof InviteUserInput, unknown]>).forEach(([field, messages]) => {
    const message = Array.isArray(messages) ? String(messages[0] ?? '') : String(messages ?? '');
    if (message) {
      setError(field, { type: 'server', message });
    }
  });
}

function RoleToggle({
  value,
  onChange,
}: {
  value: InviteUserInput['role'];
  onChange: (value: InviteUserInput['role']) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Role"
      className="grid grid-cols-2 rounded-sm border border-cream-300 bg-cream-100 p-1"
    >
      {([
        { value: 'seller_admin', label: 'Admin' },
        { value: 'seller_assistant', label: 'Assistant' },
      ] as const).map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[5px] px-3 py-2 text-body-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2',
              selected
                ? 'bg-teal-500 text-cream-50 shadow-sm'
                : 'bg-transparent text-cream-700 hover:bg-cream-200',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function InviteUserDialog({ open, onOpenChange, member }: InviteUserDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(member);
  const { data: locationsResponse, isLoading: locationsLoading } = useTenantLocations();
  const availableLocations = (locationsResponse?.locations ?? []).filter((location) => location.deleted_at == null);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const form = useForm<InviteUserInput>({
    resolver: zodResolver(InviteUserSchema),
    defaultValues: {
      full_name: member?.full_name ?? '',
      email: member?.email ?? '',
      phone: normalizePhone(member?.phone),
      role: member?.role ?? 'seller_assistant',
      location_ids: member?.location_ids ?? [],
    },
    mode: 'onBlur',
  });

  const {
    handleSubmit,
    watch,
    reset,
    clearErrors,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  const roleValue = watch('role');
  const selectedLocationIds = watch('location_ids') ?? [];
  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      reset({
        full_name: member?.full_name ?? '',
        email: member?.email ?? '',
        phone: normalizePhone(member?.phone),
        role: member?.role ?? 'seller_assistant',
        location_ids: member?.location_ids ?? [],
      });
      setLocationSearchOpen(false);
      setLocationSearchQuery('');
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) {
      reset({
        full_name: member?.full_name ?? '',
        email: member?.email ?? '',
        phone: normalizePhone(member?.phone),
        role: member?.role ?? 'seller_assistant',
        location_ids: member?.location_ids ?? [],
      });
      setLocationSearchOpen(false);
      setLocationSearchQuery('');
      return;
    }

    reset({
      full_name: member?.full_name ?? '',
      email: member?.email ?? '',
      phone: normalizePhone(member?.phone),
      role: member?.role ?? 'seller_assistant',
      location_ids: member?.location_ids ?? [],
    });
    setLocationSearchOpen(false);
    setLocationSearchQuery('');
  }, [member, open, reset]);

  useEffect(() => {
    if (roleValue === 'seller_admin' && selectedLocationIds.length > 0) {
      setValue('location_ids', [], { shouldValidate: true, shouldDirty: true });
      setLocationSearchOpen(false);
      setLocationSearchQuery('');
      return;
    }

    if (
      roleValue === 'seller_assistant'
      && member?.role === 'seller_admin'
      && selectedLocationIds.length === 0
      && availableLocations.length > 0
    ) {
      setValue('location_ids', [availableLocations[0].id], { shouldValidate: true });
    }
  }, [availableLocations, member?.role, roleValue, selectedLocationIds.length, setValue]);

  const filteredLocations = useMemo(() => {
    const q = locationSearchQuery.trim().toLowerCase();
    if (!q) return availableLocations;
    return availableLocations.filter((location) =>
      [location.name, location.address.city, location.address.state, location.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [availableLocations, locationSearchQuery]);

  const selectedLocations = useMemo(
    () => availableLocations.filter((location) => selectedLocationIds.includes(location.id)),
    [availableLocations, selectedLocationIds],
  );

  const selectedLocationSummary = useMemo(() => {
    if (selectedLocations.length === 0) return 'Search locations';
    const first = selectedLocations[0];
    return selectedLocations.length === 1
      ? first.name
      : `${first.name} +${selectedLocations.length - 1} more`;
  }, [selectedLocations]);

  const locationTriggerDescription = selectedLocations.length > 0
    ? `${selectedLocations.length} location${selectedLocations.length === 1 ? '' : 's'} selected`
    : 'Assign the user to one or more locations.';

  function toggleLocation(locationId: string, checked: boolean) {
    const next = checked
      ? [...selectedLocationIds, locationId]
      : selectedLocationIds.filter((id) => id !== locationId);

    setValue('location_ids', next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  async function onSubmit(values: InviteUserInput) {
    clearErrors();
    const url = isEdit ? `/api/team/members/${member!.id}` : '/api/team/invite';
    const method = isEdit ? 'PUT' : 'POST';

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify({
        ...values,
        location_ids: values.role === 'seller_assistant' ? (values.location_ids ?? []) : null,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      fieldErrors?: Record<string, unknown>;
      details?: {
        message?: string;
        fieldErrors?: Record<string, unknown>;
        formErrors?: string[];
      };
    };

    if (!res.ok) {
      const fieldErrors = body.fieldErrors ?? body.details?.fieldErrors;
      if (fieldErrors && typeof fieldErrors === 'object') {
        mapServerFieldErrors(fieldErrors as Record<string, unknown>, setError);
      }

      if (!fieldErrors) {
        const message =
          body.error ??
          body.details?.message ??
          body.details?.formErrors?.[0] ??
          'Something went wrong';
        setError('root', { type: 'server', message });
        toast.error(String(message));
      }
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['team'] });
    toast.success(isEdit ? 'User updated' : 'Invite sent');
    reset({
      full_name: '',
      email: '',
      phone: '',
      role: 'seller_assistant',
      location_ids: availableLocations[0] ? [availableLocations[0].id] : [],
    });
    onOpenChange(false);
  }

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Settings"
          title={isEdit ? 'Edit user' : 'Add user'}
          description={
            isEdit
              ? 'Update the user profile, contact details, and role for this tenant.'
              : 'Create a new user for this tenant workspace and send an invite.'
          }
        />

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <FormOverlayBody className="flex-1 space-y-4 overflow-y-auto sm:space-y-5">
              {errors.root ? (
                <Alert variant="danger">
                  <AlertDescription>{errors.root.message}</AlertDescription>
                </Alert>
              ) : null}

              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-caption font-medium text-cream-800">
                      Full Name <span className="text-danger-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        placeholder="Full Name"
                        className="bg-cream-50"
                      />
                    </FormControl>
                    <FormMessage className="text-caption text-danger-500" />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-caption font-medium text-cream-800">
                        Email <span className="text-danger-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          type="email"
                          placeholder="name@company.com"
                          className="bg-cream-50"
                        />
                      </FormControl>
                      <FormMessage className="text-caption text-danger-500" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-caption font-medium text-cream-800">
                        Phone Number <span className="text-danger-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-stretch">
                          <span className="inline-flex items-center rounded-l-sm border border-r-0 border-cream-300 bg-cream-200 px-3 text-body-sm text-cream-700">
                            +91
                          </span>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            type="tel"
                            inputMode="numeric"
                            placeholder="9876543210"
                            maxLength={10}
                            className="rounded-l-none bg-cream-50 font-mono tracking-wide"
                            onChange={(event) => {
                              const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
                              field.onChange(digits);
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-caption text-danger-500" />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-caption font-medium text-cream-800">
                      Role <span className="text-danger-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <RoleToggle
                        value={roleValue}
                        onChange={(value) => {
                          field.onChange(value);
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-caption text-cream-600">
                      Admins have full access. Assistants can handle daily operations.
                    </FormDescription>
                    <FormMessage className="text-caption text-danger-500" />
                  </FormItem>
                )}
              />

              {roleValue === 'seller_assistant' ? (
                <FormField
                  control={form.control}
                  name="location_ids"
                  render={() => (
                    <FormItem>
                      <FormLabel className="text-caption font-medium text-cream-800">
                        Locations <span className="text-danger-500">*</span>
                      </FormLabel>
                      <SearchOverlayPicker
                        open={locationSearchOpen}
                        onOpenChange={(next) => {
                          setLocationSearchOpen(next);
                          if (!next) {
                            setLocationSearchQuery('');
                          }
                        }}
                        title="Select locations"
                        eyebrow="Settings"
                        description="Assign the seller assistant to one or more locations."
                        triggerTitle={selectedLocationSummary}
                        triggerDescription={locationTriggerDescription}
                        searchValue={locationSearchQuery}
                        onSearchValueChange={setLocationSearchQuery}
                        searchPlaceholder="Search locations…"
                        loading={locationsLoading}
                      >
                        {selectedLocations.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedLocations.map((location) => (
                              <button
                                key={location.id}
                                type="button"
                                onClick={() => toggleLocation(location.id, false)}
                                className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100"
                              >
                                <span>{location.name}</span>
                                <span aria-hidden="true" className="text-teal-500">×</span>
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {locationsLoading ? (
                          <div className="space-y-1">
                            {Array.from({ length: 3 }).map((_, idx) => (
                              <div key={idx} className="h-12 animate-pulse rounded-[8px] bg-cream-100" />
                            ))}
                          </div>
                        ) : filteredLocations.length > 0 ? (
                          <div className="space-y-0.5">
                            {filteredLocations.map((location) => {
                              const selected = selectedLocationIds.includes(location.id);
                              return (
                                <button
                                  key={location.id}
                                  type="button"
                                  onClick={() => toggleLocation(location.id, !selected)}
                                  className={[
                                    'flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-left transition-colors',
                                    selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                                  ].join(' ')}
                                >
                                  <div className="min-w-0">
                                    <p className="text-base font-medium text-cream-900">{location.name}</p>
                                    <p className="mt-0.5 text-sm text-cream-700">
                                      {location.address.city
                                        ? `${location.address.city}${location.address.state ? `, ${location.address.state}` : ''}`
                                        : location.type.replace(/_/g, ' ')}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                    {selected ? 'Selected' : 'Add'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : locationSearchQuery.trim() ? (
                          <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                            No locations match this search.
                          </p>
                        ) : (
                          <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                            Start typing to search locations.
                          </p>
                        )}
                      </SearchOverlayPicker>
                      <FormDescription className="text-caption text-cream-600">
                        Seller assistants can only work within their assigned locations.
                      </FormDescription>
                      <FormMessage className="text-caption text-danger-500" />
                    </FormItem>
                  )}
                />
              ) : null}
            </FormOverlayBody>

            <FormOverlayFooter className="justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => dirtyGuard.handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isEdit ? <Save size={16} /> : <UserPlus size={16} />}
                {isSubmitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create User'}
              </Button>
            </FormOverlayFooter>
          </form>
        </Form>
      </FormOverlay>

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />
    </>
  );
}
