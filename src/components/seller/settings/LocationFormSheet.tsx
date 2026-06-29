'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import { apiFetch } from '@/lib/api-fetch';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { getMapsLoader } from '@/lib/google-maps-loader';
import {
  CreateLocationInputSchema,
  LocationStatusSchema,
  LocationTypeSchema,
  LocationAssociatedUserSchema,
  type TenantLocation,
} from '@/types/tenant-locations';

// ── Maps address search slideout ─────────────────────────────────────────────

interface PlaceDetails {
  lat: number | null;
  lng: number | null;
  formatted_address: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

interface MapsAddressSearchProps {
  selectedLabel: string | null;
  onSelect: (details: PlaceDetails) => void;
}

function MapsAddressSearch({ selectedLabel, onSelect }: MapsAddressSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingIndex, setFetchingIndex] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSuggestions([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => void doSearch(q), 350);
  }

  async function doSearch(q: string) {
    setLoading(true);
    setSuggestions([]);
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await getMapsLoader().importLibrary('places') as google.maps.PlacesLibrary;
      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        includedRegionCodes: ['in'],
        sessionToken: sessionTokenRef.current,
      });
      setSuggestions(results);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(suggestion: google.maps.places.AutocompleteSuggestion, index: number) {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;
    setFetchingIndex(index);
    try {
      await getMapsLoader().importLibrary('places');
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'addressComponents', 'formattedAddress'] });
      sessionTokenRef.current = null;
      if (!place.location) throw new Error('No location');
      const lat = place.location.lat();
      const lng = place.location.lng();
      const components = place.addressComponents ?? [];
      const get = (type: string) => components.find((c) => c.types.includes(type));
      const line1 = get('route')?.longText || get('establishment')?.longText || prediction.mainText?.text || '';
      const city = get('locality')?.longText ?? '';
      const state = get('administrative_area_level_1')?.shortText ?? '';
      const pincode = get('postal_code')?.longText ?? '';
      onSelect({ lat, lng, formatted_address: place.formattedAddress ?? '', line1, city, state, pincode });
      setOpen(false);
    } catch {
      // leave sheet open so user can retry
    } finally {
      setFetchingIndex(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-[8px] border border-cream-300 bg-white px-3 py-[10px] text-left transition-colors hover:bg-cream-50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <MapPin size={14} className="shrink-0 text-teal-600" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-cream-900">
              {selectedLabel ?? 'Search address on Google Maps'}
            </p>
            {!selectedLabel && (
              <p className="mt-0.5 text-xs text-cream-600">
                Auto-fill address fields from a Places search
              </p>
            )}
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-cream-500" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex h-full w-full max-w-[540px] flex-col border-l border-cream-300 bg-white">
          <SheetHeader className="flex-shrink-0 border-b border-cream-300 bg-white px-[22px] py-[18px]">
            <SheetTitle className="font-display text-xl font-medium leading-[1.15] tracking-[-0.01em] text-cream-900">
              Search address
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700" />
              <Input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="pl-8"
                placeholder="Type a place name or address…"
                autoFocus
              />
            </div>

            {loading && (
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[52px] animate-pulse rounded-[8px] bg-cream-100" />
                ))}
              </div>
            )}

            {!loading && suggestions.length === 0 && query.trim().length >= 2 && (
              <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                No results found.
              </p>
            )}

            {!loading && suggestions.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {suggestions.map((s, i) => (
                  <button
                    key={s.placePrediction?.placeId ?? i}
                    type="button"
                    disabled={fetchingIndex !== null}
                    onClick={() => void handleSelect(s, i)}
                    className="flex w-full items-start gap-3 rounded-[8px] px-3 py-[10px] text-left transition-colors hover:bg-cream-100 disabled:opacity-60"
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0 text-cream-500" />
                    <p className="text-sm text-cream-900">
                      {fetchingIndex === i ? 'Loading…' : (s.placePrediction?.text.text ?? '')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Location form ─────────────────────────────────────────────────────────────

const FormSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(200),
  type: LocationTypeSchema,
  phone_number: z.string().trim().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').optional().or(z.literal('')),
  status: LocationStatusSchema,
  line1: z.string().max(500),
  line2: z.string().max(500).optional(),
  city: z.string().max(200),
  state: z.string().max(2),
  pincode: z.string().max(10),
  inventory_tracking: z.boolean(),
  is_default: z.boolean(),
  external_ref: z.string().max(200).optional(),
  associated_users: z.array(LocationAssociatedUserSchema).default([]),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

function defaultsFromLocation(loc: TenantLocation | null): FormValues {
  if (!loc) {
    return {
      name: '',
      type: 'warehouse',
      phone_number: '',
      status: 'active',
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: '',
      inventory_tracking: true,
      is_default: false,
      external_ref: '',
      associated_users: [],
    };
  }
  return {
    name: loc.name,
    type: loc.type,
    phone_number: loc.phone_number ?? '',
    status: loc.status,
    line1: loc.address?.line1 ?? '',
    line2: loc.address?.line2 ?? '',
    city: loc.address?.city ?? '',
    state: loc.address?.state ?? '',
    pincode: loc.address?.pincode ?? '',
    inventory_tracking: loc.inventory_tracking,
    is_default: loc.is_default,
    external_ref: loc.external_ref ?? '',
    associated_users: loc.associated_users ?? [],
    lat: loc.lat ?? undefined,
    lng: loc.lng ?? undefined,
  };
}

interface LocationFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLocation: TenantLocation | null;
}

type TeamMemberOption = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'seller_admin' | 'seller_assistant';
  status: 'active' | 'pending' | 'inactive';
};

export function LocationFormSheet({ open, onOpenChange, editingLocation }: LocationFormSheetProps) {
  const { createLocation, updateLocation, isCreating, isUpdating } = useTenantLocations();
  const { currentTenantId } = useAuth();
  const [mapsLabel, setMapsLabel] = useState<string | null>(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const isEdit = Boolean(editingLocation?.id && !editingLocation.deleted_at);
  const pending = isCreating || isUpdating;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaultsFromLocation(editingLocation),
  });
  const selectedUsers = form.watch('associated_users') ?? [];

  const { data: teamMembersResponse, isLoading: teamMembersLoading } = useQuery({
    queryKey: ['team-members', currentTenantId],
    enabled: open && Boolean(currentTenantId),
    queryFn: async () => {
      const res = await apiFetch('/api/team/members');
      if (!res.ok) {
        throw new Error('Failed to load team members');
      }
      return res.json() as Promise<{ members?: TeamMemberOption[] }>;
    },
  });
  const teamMembers = teamMembersResponse?.members ?? [];

  useEffect(() => {
    if (open) {
      form.reset(defaultsFromLocation(editingLocation));
      setMapsLabel(
        editingLocation?.address?.city
          ? `${editingLocation.address.line1 || editingLocation.name}, ${editingLocation.address.city}`
          : null,
      );
      setUserSearchQuery('');
      setUserSearchOpen(false);
    }
  }, [open, editingLocation, form]);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      form.reset(defaultsFromLocation(editingLocation));
      onOpenChange(false);
    },
  });

  const title = useMemo(() => (isEdit ? 'Edit location' : 'Add location'), [isEdit]);
  const description = useMemo(
    () =>
      isEdit
        ? "Update this location's details."
        : 'Add a warehouse or branch. Inventory can be tracked per location.',
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

  const userTriggerDescription = selectedUsers.length > 0
    ? `${selectedUsers.length} user${selectedUsers.length === 1 ? '' : 's'} selected`
    : 'Choose existing tenant users for this location.';

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

  function handleMapsSelect(details: {
    lat: number | null;
    lng: number | null;
    line1: string;
    city: string;
    state: string;
    pincode: string;
    formatted_address: string;
  }) {
    form.setValue('line1', details.line1, { shouldDirty: true });
    form.setValue('city', details.city, { shouldDirty: true });
    form.setValue('state', details.state.slice(0, 2).toUpperCase(), { shouldDirty: true });
    form.setValue('pincode', details.pincode, { shouldDirty: true });
    if (details.lat !== null) form.setValue('lat', details.lat, { shouldDirty: true });
    if (details.lng !== null) form.setValue('lng', details.lng, { shouldDirty: true });
    setMapsLabel(
      details.city
        ? `${details.line1 || details.formatted_address.split(',')[0]}, ${details.city}`
        : details.formatted_address,
    );
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name.trim(),
      type: values.type,
      phone_number: values.phone_number?.trim() ? values.phone_number.trim() : null,
      status: values.status,
      address: {
        line1: values.line1.trim(),
        line2: (values.line2 ?? '').trim(),
        city: values.city.trim(),
        state: values.state.trim().toUpperCase().slice(0, 2),
        pincode: values.pincode.trim(),
      },
      inventory_tracking: values.inventory_tracking,
      is_default: values.is_default,
      external_ref: values.external_ref?.trim() ? values.external_ref.trim() : undefined,
      associated_users: values.associated_users,
      lat: values.lat,
      lng: values.lng,
    };

    const parsedCreate = CreateLocationInputSchema.safeParse(payload);
    if (!parsedCreate.success) {
      form.setError('root', { message: parsedCreate.error.issues[0]?.message ?? 'Invalid' });
      return;
    }

    if (isEdit && editingLocation) {
      await updateLocation({
        id: editingLocation.id,
        patch: {
          name: parsedCreate.data.name,
          type: parsedCreate.data.type,
          phone_number: parsedCreate.data.phone_number ?? null,
          status: parsedCreate.data.status,
          address: parsedCreate.data.address,
          inventory_tracking: parsedCreate.data.inventory_tracking,
          is_default: parsedCreate.data.is_default,
          external_ref: parsedCreate.data.external_ref ?? null,
          associated_users: parsedCreate.data.associated_users,
          lat: parsedCreate.data.lat ?? null,
          lng: parsedCreate.data.lng ?? null,
        },
      });
    } else {
      await createLocation(parsedCreate.data);
    }
    form.reset(values);
    onOpenChange(false);
  }

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader title={title} description={description} eyebrow="Settings" />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <FormOverlayBody className="flex-1 space-y-5 overflow-y-auto">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Mumbai Warehouse" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="warehouse">Warehouse — holds stock</SelectItem>
                        <SelectItem value="branch">Branch — sales or admin office</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              <FormBlock title="Address">
                <div className="space-y-4">
                  <MapsAddressSearch selectedLabel={mapsLabel} onSelect={handleMapsSelect} />

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
                </div>
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
                        if (!next) {
                          setUserSearchQuery('');
                        }
                      }}
                      title="Add users"
                      eyebrow="Settings"
                      description="Select one or more existing tenant users for this location."
                      triggerTitle={selectedUserSummary}
                      triggerDescription={userTriggerDescription}
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
                                  <p className="text-base font-medium text-cream-900">
                                    {member.full_name ?? member.email}
                                  </p>
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
                    <p className="text-body-sm text-cream-600">
                      Select existing tenant users only. Their email and name will be stored on the location.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="external_ref"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>External reference (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ERP / Tally code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inventory_tracking"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-cream-200 p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Track inventory at this location</FormLabel>
                      <p className="text-body-sm text-cream-600">Stock levels are maintained per SKU for tracked locations.</p>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-cream-200 p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Default location</FormLabel>
                      <p className="text-body-sm text-cream-600">Used as the preferred location for new inventory rows where applicable.</p>
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
                {isEdit ? 'Save changes' : 'Add location'}
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
