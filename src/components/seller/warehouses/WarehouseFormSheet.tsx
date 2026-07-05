'use client';

import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { MutationButton } from '@/components/ui/mutation-button';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-fetch';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateWarehouseMutation, useUpdateWarehouse } from '@/hooks/useWarehouses';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import {
  CreateWarehouseInputSchema,
  WarehouseAssociatedUserSchema,
  WarehouseStatusSchema,
  type TenantWarehouse,
} from '@/types/tenant-warehouses';

const FormSchema = z.object({
  name: z.string().min(1, 'Warehouse name is required').max(200),
  location_id: z.string().uuid().optional().nullable(),
  phone_number: z.string().trim().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').optional().or(z.literal('')),
  status: WarehouseStatusSchema,
  line1: z.string().max(500),
  line2: z.string().max(500).optional(),
  city: z.string().max(200),
  state: z.string().max(2),
  pincode: z.string().max(10),
  is_default: z.boolean(),
  external_ref: z.string().max(200).optional(),
  associated_users: z.array(WarehouseAssociatedUserSchema).default([]),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

type TeamMemberOption = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'seller_admin' | 'seller_assistant';
  status: 'active' | 'pending' | 'inactive';
};

function defaultsFromWarehouse(warehouse: TenantWarehouse | null): FormValues {
  if (!warehouse) {
    return {
      name: '',
      location_id: null,
      phone_number: '',
      status: 'active',
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: '',
      is_default: false,
      external_ref: '',
      associated_users: [],
    };
  }

  return {
    name: warehouse.name,
    location_id: warehouse.location_id,
    phone_number: warehouse.phone_number ?? '',
    status: warehouse.status,
    line1: warehouse.address.line1 ?? '',
    line2: warehouse.address.line2 ?? '',
    city: warehouse.address.city ?? '',
    state: warehouse.address.state ?? '',
    pincode: warehouse.address.pincode ?? '',
    is_default: warehouse.is_default,
    external_ref: warehouse.external_ref ?? '',
    associated_users: warehouse.associated_users ?? [],
    lat: warehouse.lat ?? undefined,
    lng: warehouse.lng ?? undefined,
  };
}

interface WarehouseFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingWarehouse: TenantWarehouse | null;
}

export function WarehouseFormSheet({ open, onOpenChange, editingWarehouse }: WarehouseFormSheetProps) {
  const { currentTenantId } = useAuth();
  const { data: locationsData } = useTenantLocations();
  const createWarehouse = useCreateWarehouseMutation();
  const updateWarehouse = useUpdateWarehouse();
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const isEdit = Boolean(editingWarehouse?.id);
  const pending = createWarehouse.isPending || updateWarehouse.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaultsFromWarehouse(editingWarehouse),
  });

  const selectedUsers = form.watch('associated_users') ?? [];

  const { data: teamMembersResponse, isLoading: teamMembersLoading } = useQuery({
    queryKey: ['team-members', currentTenantId],
    enabled: open && Boolean(currentTenantId),
    queryFn: async () => {
      const res = await apiFetch('/api/team/members');
      if (!res.ok) throw new Error('Failed to load team members');
      return res.json() as Promise<{ members?: TeamMemberOption[] }>;
    },
  });

  const teamMembers = teamMembersResponse?.members ?? [];

  useEffect(() => {
    if (open) {
      form.reset(defaultsFromWarehouse(editingWarehouse));
      setUserSearchOpen(false);
      setUserSearchQuery('');
    }
  }, [editingWarehouse, form, open]);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      form.reset(defaultsFromWarehouse(editingWarehouse));
      onOpenChange(false);
    },
  });

  const title = useMemo(() => (isEdit ? 'Edit warehouse' : 'Add warehouse'), [isEdit]);
  const description = useMemo(
    () => (isEdit ? "Update this warehouse's details." : 'Add a physical stock node for inventory tracking and fulfillment.'),
    [isEdit],
  );

  const filteredTeamMembers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return teamMembers;
    return teamMembers.filter((member) =>
      [member.full_name, member.email, member.phone, member.role, member.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [teamMembers, userSearchQuery]);

  const selectedUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const user of selectedUsers) {
      if (user.user_id) ids.add(user.user_id);
      else ids.add(user.email.toLowerCase());
    }
    return ids;
  }, [selectedUsers]);

  const selectedUserSummary = useMemo(() => {
    if (selectedUsers.length === 0) return 'Search team members';
    const first = selectedUsers[0];
    const head = first.user_name ?? first.email;
    return selectedUsers.length === 1 ? head : `${head} +${selectedUsers.length - 1} more`;
  }, [selectedUsers]);

  function upsertSelectedUser(member: TeamMemberOption, checked: boolean) {
    const next = checked
      ? [
          ...selectedUsers.filter((user) => user.user_id !== member.user_id && user.email.toLowerCase() !== member.email.toLowerCase()),
          {
            email: member.email,
            user_name: member.full_name,
            user_id: member.user_id,
          },
        ]
      : selectedUsers.filter((user) => user.user_id !== member.user_id && user.email.toLowerCase() !== member.email.toLowerCase());

    form.setValue('associated_users', next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  function removeSelectedUser(identifier: string) {
    const next = selectedUsers.filter(
      (user) => user.user_id !== identifier && user.email.toLowerCase() !== identifier.toLowerCase(),
    );
    form.setValue('associated_users', next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name.trim(),
      location_id: values.location_id ?? null,
      phone_number: values.phone_number?.trim() ? values.phone_number.trim() : null,
      status: values.status,
      address: {
        line1: values.line1.trim(),
        line2: (values.line2 ?? '').trim(),
        city: values.city.trim(),
        state: values.state.trim().toUpperCase().slice(0, 2),
        pincode: values.pincode.trim(),
      },
      is_default: values.is_default,
      external_ref: values.external_ref?.trim() ? values.external_ref.trim() : undefined,
      associated_users: values.associated_users,
      lat: values.lat ?? null,
      lng: values.lng ?? null,
    };

    const parsed = CreateWarehouseInputSchema.safeParse(payload);
    if (!parsed.success) {
      form.setError('root', { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }

    if (isEdit && editingWarehouse) {
      await updateWarehouse.mutateAsync({
        id: editingWarehouse.id,
        patch: {
          ...parsed.data,
          external_ref: parsed.data.external_ref ?? null,
        },
      });
    } else {
      await createWarehouse.mutateAsync(parsed.data);
    }

    form.reset(values);
    onOpenChange(false);
  }

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader title={title} description={description} eyebrow="Inventory" />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <FormOverlayBody className="flex-1 space-y-5 overflow-y-auto">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warehouse name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Mumbai Central Warehouse" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormSectionGrid>
                <FormField
                  control={form.control}
                  name="location_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linked location</FormLabel>
                      <Select
                        value={field.value ?? '__none__'}
                        onValueChange={(value) => field.onChange(value === '__none__' ? null : value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No linked location</SelectItem>
                          {(locationsData?.locations ?? []).map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSectionGrid>

              <FormSectionGrid>
                <FormField
                  control={form.control}
                  name="phone_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number</FormLabel>
                      <FormControl>
                        <Input {...field} inputMode="numeric" placeholder="10-digit mobile" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="external_ref"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>External reference</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ERP / Zoho warehouse code" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSectionGrid>

              <FormBlock title="Address">
                <FormSectionGrid>
                  <FormField
                    control={form.control}
                    name="line1"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Street / line 1</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Building, street" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="line2"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Line 2 (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Floor, unit" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State (2 letters)</FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={2} className="uppercase" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pincode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PIN code</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSectionGrid>
              </FormBlock>

              <FormField
                control={form.control}
                name="associated_users"
                render={() => (
                  <FormItem>
                    <FormLabel>Associated users</FormLabel>
                    <SearchOverlayPicker
                      open={userSearchOpen}
                      onOpenChange={(next) => {
                        setUserSearchOpen(next);
                        if (!next) setUserSearchQuery('');
                      }}
                      title="Add users"
                      eyebrow="Inventory"
                      description="Select one or more existing tenant users for this warehouse."
                      triggerTitle={selectedUserSummary}
                      triggerDescription={
                        selectedUsers.length > 0
                          ? `${selectedUsers.length} user${selectedUsers.length === 1 ? '' : 's'} selected`
                          : 'Choose existing tenant users for this warehouse.'
                      }
                      searchValue={userSearchQuery}
                      onSearchValueChange={setUserSearchQuery}
                      searchPlaceholder="Search team members…"
                      loading={teamMembersLoading}
                    >
                      {selectedUsers.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedUsers.map((user) => (
                            <button
                              key={`${user.user_id ?? user.email}`}
                              type="button"
                              onClick={() => removeSelectedUser(user.user_id ?? user.email)}
                              className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100"
                            >
                              <span>{user.user_name ?? user.email}</span>
                              <span aria-hidden="true" className="text-teal-500">×</span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {teamMembersLoading ? (
                        <div className="space-y-1">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <div key={idx} className="h-12 animate-pulse rounded-[8px] bg-cream-100" />
                          ))}
                        </div>
                      ) : filteredTeamMembers.length > 0 ? (
                        <div className="space-y-0.5">
                          {filteredTeamMembers.map((member) => {
                            const selected = selectedUserIds.has(member.user_id) || selectedUserIds.has(member.email.toLowerCase());
                            return (
                              <button
                                key={member.user_id}
                                type="button"
                                onClick={() => upsertSelectedUser(member, !selected)}
                                className={[
                                  'flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-left transition-colors',
                                  selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                                ].join(' ')}
                              >
                                <div className="min-w-0">
                                  <p className="text-base font-medium text-cream-900">{member.full_name ?? member.email}</p>
                                  <p className="mt-0.5 text-sm text-cream-700">
                                    {member.email}
                                    {member.phone ? ` · ${member.phone}` : ''}
                                    {member.role === 'seller_admin' ? ' · admin' : ' · assistant'}
                                  </p>
                                </div>
                                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                                  {selected ? 'Selected' : member.status}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : userSearchQuery.trim() ? (
                        <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                          No team members match this search.
                        </p>
                      ) : (
                        <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                          Start typing to search existing team members.
                        </p>
                      )}
                    </SearchOverlayPicker>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-cream-200 p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Default warehouse</FormLabel>
                      <p className="text-body-sm text-cream-600">Used as the default stock node for routing and fallback fulfillment.</p>
                    </div>
                  </FormItem>
                )}
              />

              {form.formState.errors.root ? (
                <p className="text-body-sm text-danger-600">{form.formState.errors.root.message}</p>
              ) : null}
            </FormOverlayBody>

            <FormOverlayFooter className="justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => dirtyGuard.handleOpenChange(false)}>
                Cancel
              </Button>
              <MutationButton type="submit" isPending={pending} pendingLabel="Saving…">
                {isEdit ? 'Save changes' : 'Add warehouse'}
              </MutationButton>
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
