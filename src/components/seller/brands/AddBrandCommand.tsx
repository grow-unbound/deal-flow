'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { z } from 'zod';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { BrowseUploadField } from '@/components/ui/browse-upload-field';
import { StackedPickerField, type PickerItem } from '@/components/ui/stacked-picker-field';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
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
import {
  useCreateTenantBrand,
  useSearchMasterBrands,
  useTenantBrands,
  useUpdateTenantBrand,
  type BrandDetailRow,
  type MasterBrand,
} from '@/hooks/useBrands';
import { useTenantCohortOptions } from '@/hooks/useCohorts';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { uploadEntityFile } from '@/lib/upload-client';

const STACKED_PICKER_THRESHOLD = 8;
const INLINE_COHORT_RESULTS = 5;
const INLINE_BRAND_RESULTS = 4;

const BrandSlideOverSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters and hyphens.'),
  logo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  margin_pct: z.coerce.number().min(0, 'Margin must be 0 or more').max(100, 'Margin cannot exceed 100').nullable().optional(),
  exclusivity: z.boolean().default(false),
  external_ref: z.string().optional().or(z.literal('')),
  principal_name: z.string().optional().or(z.literal('')),
  principal_email: z.string().email('Invalid email address').optional().or(z.literal('')),
  principal_phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits').optional().or(z.literal('')),
  principal_location: z.string().optional().or(z.literal('')),
  contact_name: z.string().optional().or(z.literal('')),
  contact_email: z.string().email('Invalid email address').optional().or(z.literal('')),
  contact_phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits').optional().or(z.literal('')),
  default_cohort_id: z.string().uuid('Invalid cohort').nullable().optional(),
});

type BrandSlideOverValues = z.infer<typeof BrandSlideOverSchema>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Assign a consistent hue bucket (teal / ember / cream) to a brand name
type BrandHue = 'teal' | 'ember' | 'cream';
const HUE_BUCKETS: BrandHue[] = ['teal', 'ember', 'cream'];

function getBrandHue(name: string): BrandHue {
  return HUE_BUCKETS[name.charCodeAt(0) % 3];
}

const HUE_CLASSES: Record<BrandHue, { bg: string; text: string; border: string }> = {
  teal:  { bg: 'bg-teal-50',   text: 'text-teal-700',  border: 'border-teal-100' },
  ember: { bg: 'bg-ember-50',  text: 'text-ember-700', border: 'border-ember-100' },
  cream: { bg: 'bg-cream-100', text: 'text-cream-800', border: 'border-cream-400' },
};

function BrandAvatar({ brand }: { brand: MasterBrand }) {
  const hue = getBrandHue(brand.name);
  const { bg, text, border } = HUE_CLASSES[hue];
  const initials = brand.name
    .split(' ')
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (brand.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logo_url}
        alt={brand.name}
        className="h-8 w-8 shrink-0 rounded-[8px] border border-cream-200 bg-white object-contain"
      />
    );
  }
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border font-display text-sm font-medium',
        bg, text, border,
      )}
    >
      {initials}
    </div>
  );
}

function BrandFormSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-[10px] border-b border-cream-300 pb-5">
        <div className="h-4 w-20 animate-pulse rounded-[8px] bg-cream-200" />
        <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
        <div className="h-20 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
      </div>
      <div className="flex flex-col gap-[10px] border-b border-cream-300 pb-5">
        <div className="h-4 w-28 animate-pulse rounded-[8px] bg-cream-200" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
          <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
          <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
          <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
        </div>
      </div>
      <div className="flex flex-col gap-[10px]">
        <div className="h-4 w-24 animate-pulse rounded-[8px] bg-cream-200" />
        <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

interface AddBrandCommandProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  mode?: 'create' | 'edit';
  brand?: BrandDetailRow | null;
}

export function AddBrandCommand({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  mode = 'create',
  brand = null,
}: AddBrandCommandProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedMasterBrand, setSelectedMasterBrand] = useState<MasterBrand | null>(null);
  // inputValue drives the text field immediately; debouncedSearch drives the API call
  const [inputValue, setInputValue] = useState('');
  const [customBrandNameSelected, setCustomBrandNameSelected] = useState<string | null>(null);
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [stagedLogo, setStagedLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const debouncedSearch = useDebounce(inputValue, 300);
  const isEditMode = mode === 'edit' && !!brand;

  const isControlled = typeof controlledOpen === 'boolean';
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const form = useForm<BrandSlideOverValues>({
    resolver: zodResolver(BrandSlideOverSchema),
    defaultValues: {
      name: '',
      slug: '',
      logo_url: '',
      description: '',
      margin_pct: null,
      exclusivity: false,
      external_ref: '',
      principal_name: '',
      principal_email: '',
      principal_phone: '',
      principal_location: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      default_cohort_id: null,
    },
  });

  const createBrand = useCreateTenantBrand();
  const updateBrand = useUpdateTenantBrand(brand?.id ?? '');
  const { data: tenantBrandsData } = useTenantBrands();
  const { data: searchData, isLoading: isSearching } = useSearchMasterBrands(debouncedSearch);
  const cohortsFlag = useFlagState('COHORTS');
  const cohortsEnabled = cohortsFlag === true;
  const { data: cohortOptions = [], isLoading: cohortsLoading } = useTenantCohortOptions(cohortsEnabled);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      form.reset();
      setSelectedMasterBrand(null);
      setInputValue('');
      setCustomBrandNameSelected(null);
      setIsNameManuallyEdited(false);
      setStagedLogo(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setOpen(false);
    },
  });

  const linkedBrandIds = useMemo(
    () => new Set((tenantBrandsData?.brands ?? []).map((b) => b.master_brand_id)),
    [tenantBrandsData?.brands],
  );

  const watchedName = form.watch('name');
  const brandResults = (searchData?.brands ?? []).slice(0, INLINE_BRAND_RESULTS);
  const isPending = inputValue.trim() !== debouncedSearch.trim() || isSearching;
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
  // Always stacked — don't show cohort list inline on form load, open the picker panel instead
  const pickerMode = 'stacked' as const;
  const formReady = cohortsFlag !== undefined || !open;

  useEffect(() => {
    if (selectedMasterBrand && !isNameManuallyEdited) return;
    form.setValue('slug', slugify(watchedName), { shouldDirty: false, shouldValidate: true });
  }, [form, isNameManuallyEdited, selectedMasterBrand, watchedName]);

  useEffect(() => {
    if (!open || !isEditMode || !brand) return;

    setSelectedMasterBrand(null);
    setCustomBrandNameSelected(brand.display_name_override ?? '');
    setInputValue(brand.display_name_override ?? '');
    setIsNameManuallyEdited(true);
    form.reset({
      name: brand.display_name_override ?? '',
      slug: brand.slug ?? '',
      logo_url: brand.logo_url ?? '',
      description: brand.description ?? '',
      margin_pct: brand.margin_pct ?? null,
      exclusivity: brand.exclusivity ?? false,
      external_ref: brand.external_ref ?? '',
      principal_name: brand.principal_name ?? '',
      principal_email: brand.principal_email ?? '',
      principal_phone: brand.principal_phone ?? '',
      principal_location: brand.principal_location ?? '',
      contact_name: brand.contact_name ?? '',
      contact_email: brand.contact_email ?? '',
      contact_phone: brand.contact_phone ?? '',
      default_cohort_id: brand.default_cohort_id ?? null,
    });
  }, [brand, form, isEditMode, open]);

  useEffect(() => {
    if (!open || !selectedMasterBrand) return;
    setInputValue(selectedMasterBrand.name);
  }, [open, selectedMasterBrand]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function applyMasterBrand(brand: MasterBrand) {
    setSelectedMasterBrand(brand);
    setCustomBrandNameSelected(null);
    setIsNameManuallyEdited(false);
    setInputValue(brand.name);
    form.reset(
      { ...form.getValues(), name: brand.name, slug: brand.slug, logo_url: brand.logo_url ?? '' },
      { keepDirty: true },
    );
  }

  function selectCustomBrandName(name: string) {
    setCustomBrandNameSelected(name);
    form.setValue('name', name, { shouldDirty: true });
    form.setValue('slug', slugify(name), { shouldDirty: false, shouldValidate: true });
  }

  function clearCustomBrandName() {
    setCustomBrandNameSelected(null);
  }

  function switchToCustomBrand() {
    setSelectedMasterBrand(null);
    setCustomBrandNameSelected(null);
    setInputValue('');
    form.setValue('slug', slugify(form.getValues('name')), { shouldDirty: false, shouldValidate: true });
  }

  const onSubmit: SubmitHandler<BrandSlideOverValues> = async (values) => {
    try {
      const sharedPayload = {
        display_name_override: values.name.trim(),
        slug: values.slug,
        description: values.description || '',
        margin_pct: values.margin_pct ?? null,
        exclusivity: values.exclusivity ?? false,
        external_ref: values.external_ref || '',
        principal_name: values.principal_name,
        principal_email: values.principal_email,
        principal_phone: values.principal_phone,
        principal_location: values.principal_location,
        contact_name: values.contact_name,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone,
        default_cohort_id: values.default_cohort_id ?? null,
      };

      const result = isEditMode && brand
        ? await updateBrand.mutateAsync({
            ...sharedPayload,
            logo_url: values.logo_url || null,
          })
        : selectedMasterBrand
          ? await createBrand.mutateAsync({
              mode: 'import',
              master_brand_id: selectedMasterBrand.id,
              optimistic_master_brand: selectedMasterBrand,
              name: values.name.trim(),
              ...sharedPayload,
            })
          : await createBrand.mutateAsync({
              mode: 'custom',
              name: values.name.trim(),
              ...sharedPayload,
            });

      form.reset();
      setSelectedMasterBrand(null);
      setInputValue('');
      setCustomBrandNameSelected(null);
      setIsNameManuallyEdited(false);
      setStagedLogo(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setOpen(false);

      const savedBrandId = 'brand' in result ? result.brand.id : brand?.id;
      if (savedBrandId && stagedLogo) {
        void uploadEntityFile({
          endpoint: '/api/upload/tenant-brand',
          entityId: savedBrandId,
          file: stagedLogo,
          imageType: 'logo',
        }).catch((uploadError) => {
          toast.warning(
            `${isEditMode ? 'Brand saved' : 'Brand added'}, but image upload failed. Edit and retry.`,
            {
              description:
                uploadError instanceof Error ? uploadError.message : 'Image upload failed.',
            },
          );
        });
      }
    } catch (error) {
      const err = error as { status?: number; error?: string; details?: { fieldErrors?: Record<string, string[]> } };
      if (err.status === 409) {
        form.setError('slug', { message: err.error ?? 'A brand with this slug already exists.' });
        return;
      }
      if (err.status === 400 && err.details && 'fieldErrors' in err.details) {
        Object.entries(err.details.fieldErrors ?? {}).forEach(([field, messages]) => {
          if (!messages?.length) return;
          form.setError(field as keyof BrandSlideOverValues, { message: messages[0] });
        });
        return;
      }
      toast.error(err.error ?? 'Failed to save brand');
    }
  };

  // Show dropdown when typing and no master/custom entity has been selected yet
  const showDropdown =
    !isEditMode &&
    inputValue.trim().length > 0 &&
    !selectedMasterBrand &&
    !customBrandNameSelected;

  return (
    <>
      {!hideTrigger ? (
        <Button onClick={() => setOpen(true)} variant="accent">
          <Plus size={16} />
          {isEditMode ? 'Edit brand' : 'Add a brand'}
        </Button>
      ) : null}

      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Brands"
          title={isEditMode ? 'Edit brand' : 'Add a brand'}
          description={
            isEditMode
              ? 'Update the tenant-facing brand details used in your workspace.'
              : 'Start with the name — we\'ll match it against the master directory.'
          }
        />

        <FormOverlayBody className="space-y-5">
          {!formReady ? (
            <BrandFormSkeleton />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                {/* Imported-from-master banner */}
                {selectedMasterBrand ? (
                  <div className="flex items-center gap-3 rounded-[12px] border border-teal-100 bg-teal-50 px-[14px] py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-teal-100 text-teal-700">
                      <Check size={16} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-cream-900">
                        Imported from master · {selectedMasterBrand.name}
                      </p>
                      <p className="text-sm text-cream-700">Adjust anything below before saving.</p>
                    </div>
                    <button
                      type="button"
                      onClick={switchToCustomBrand}
                      className="shrink-0 rounded-[6px] px-[6px] py-1 text-sm text-cream-700 hover:bg-teal-100 hover:text-teal-900"
                    >
                      Clear
                    </button>
                  </div>
                ) : customBrandNameSelected ? (
                  <div className="flex items-center gap-3 rounded-[12px] border border-ember-100 bg-ember-50 px-[14px] py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-ember-100 text-ember-700">
                      <Plus size={16} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-cream-900">
                        Creating new · {customBrandNameSelected}
                      </p>
                      <p className="text-sm text-cream-700">This brand will be added to your account.</p>
                    </div>
                    <button
                      type="button"
                      onClick={clearCustomBrandName}
                      className="shrink-0 rounded-[6px] px-[6px] py-1 text-sm text-cream-700 hover:bg-ember-100 hover:text-ember-900"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}

                <FormBlock title="Identity">
                  {/* Name field + combo dropdown */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Brand name</FormLabel>
                        <FormControl>
                          <Popover open={showDropdown}>
                            <PopoverAnchor asChild>
                              <div className="relative">
                                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700" />
                                <Input
                                  {...field}
                                  value={inputValue}
                                  className="pl-8"
                                placeholder={isEditMode ? 'Brand name' : 'Search master brands or type a new name'}
                                readOnly={isEditMode || !!selectedMasterBrand || !!customBrandNameSelected}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    field.onChange(val);
                                    setInputValue(val);
                                    setCustomBrandNameSelected(null);
                                    if (selectedMasterBrand) {
                                      setIsNameManuallyEdited(val.trim() !== selectedMasterBrand.name);
                                    }
                                  }}
                                />
                              </div>
                            </PopoverAnchor>
                            <PopoverContent
                              side="bottom"
                              align="start"
                              sideOffset={6}
                              onOpenAutoFocus={(e) => e.preventDefault()}
                              onInteractOutside={(e) => e.preventDefault()}
                              style={{ width: 'max(var(--radix-popover-anchor-width, 320px), 320px)' }}
                              className="overflow-hidden rounded-[12px] border-cream-300 bg-white p-0 shadow-[0_12px_32px_rgba(20,40,35,0.12),0_2px_6px_rgba(20,40,35,0.05)]"
                            >
                              {isPending ? (
                                <div className="space-y-1 p-3">
                                  <div className="h-10 animate-pulse rounded-[8px] bg-cream-100" />
                                  <div className="h-10 animate-pulse rounded-[8px] bg-cream-100" />
                                  <div className="h-10 animate-pulse rounded-[8px] bg-cream-100" />
                                </div>
                              ) : brandResults.length > 0 ? (
                                <>
                                  <div className="px-[14px] pb-[6px] pt-[10px] text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">
                                    Master directory · import &amp; prefill
                                  </div>
                                  <div className="pb-1">
                                    {brandResults.map((brand) => {
                                      const alreadyLinked = linkedBrandIds.has(brand.id);
                                      return (
                                        <button
                                          key={brand.id}
                                          type="button"
                                          disabled={alreadyLinked}
                                          onClick={() => applyMasterBrand(brand)}
                                          className={cn(
                                            'mx-1 flex w-[calc(100%-8px)] items-center gap-3 rounded-[8px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                            'hover:bg-cream-100',
                                          )}
                                        >
                                          <BrandAvatar brand={brand} />
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-base font-medium text-cream-900">{brand.name}</p>
                                            <p className="truncate text-sm text-cream-700">
                                              {brand.slug}{brand.description ? ` · ${brand.description}` : ''}
                                            </p>
                                          </div>
                                          {alreadyLinked ? (
                                            <span className="shrink-0 rounded-full bg-cream-200 px-[7px] py-[2px] text-xs font-semibold uppercase tracking-[0.06em] text-cream-600">
                                              Imported
                                            </span>
                                          ) : null}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => selectCustomBrandName(inputValue)}
                                    className="flex w-full items-center gap-1.5 border-t border-cream-300 bg-cream-50 px-4 py-[10px] text-left text-sm text-cream-700 transition-colors hover:bg-cream-100"
                                  >
                                    <Plus size={13} className="shrink-0 text-cream-700" />
                                    <span>
                                      Create new brand{' '}
                                      <strong className="font-medium text-cream-900">&ldquo;{inputValue}&rdquo;</strong>
                                    </span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectCustomBrandName(inputValue)}
                                  className="flex w-full items-center gap-1.5 px-4 py-[10px] text-left text-sm text-cream-700 transition-colors hover:bg-cream-100"
                                >
                                  <Plus size={13} className="shrink-0 text-cream-700" />
                                  <span>
                                    No master match — create{' '}
                                    <strong className="font-medium text-cream-900">&ldquo;{inputValue}&rdquo;</strong>{' '}
                                    as a private brand
                                  </span>
                                </button>
                              )}
                            </PopoverContent>
                          </Popover>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormSectionGrid>
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="space-y-2 md:col-span-2">
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Short brand note for your team" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="logo_url"
                      render={({ field }) => (
                        <FormItem className="space-y-2 md:col-span-2">
                          <FormLabel>Logo</FormLabel>
                          <FormControl>
                            <BrowseUploadField
                              value={field.value ? [field.value] : []}
                              onChange={(urls) => {
                                const nextUrl = urls[0] ?? null;
                                if (!nextUrl) {
                                  setStagedLogo(null);
                                  if (previewUrl) {
                                    URL.revokeObjectURL(previewUrl);
                                    setPreviewUrl(null);
                                  }
                                  field.onChange('');
                                  return;
                                }
                                setPreviewUrl(nextUrl);
                                field.onChange(nextUrl);
                              }}
                              maxFiles={1}
                              label="Upload logo"
                              emptyLabel="Click or drag to upload"
                              helperText="JPG, PNG, WebP · Max 5MB"
                              previewInline
                              uploadFile={async (file) => {
                                if (previewUrl) {
                                  URL.revokeObjectURL(previewUrl);
                                }
                                const objectUrl = URL.createObjectURL(file);
                                setPreviewUrl(objectUrl);
                                setStagedLogo(file);
                                return objectUrl;
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="margin_pct"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Margin %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                              placeholder="0.00"
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
                            <Input {...field} placeholder="Tally / Zoho code" className="font-mono" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormSectionGrid>
                </FormBlock>

                <FormBlock title="Principal contact">
                  <FormSectionGrid>
                    <FormField control={form.control} name="principal_name" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Name</FormLabel>
                        <FormControl><Input {...field} placeholder="WineYard team" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="principal_location" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Location</FormLabel>
                        <FormControl><Input {...field} placeholder="Bengaluru HQ" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="principal_email" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input {...field} type="email" placeholder="principal@example.com" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="principal_phone" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <div className="flex items-stretch">
                            <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-3 text-base text-cream-700">
                              +91
                            </span>
                            <Input
                              {...field}
                              value={field.value ?? ''}
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
                    )} />
                  </FormSectionGrid>
                </FormBlock>

                <FormBlock title="Tenant contact">
                  <FormSectionGrid>
                    <FormField control={form.control} name="contact_name" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Name</FormLabel>
                        <FormControl><Input {...field} placeholder="Internal owner" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contact_email" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input {...field} type="email" placeholder="owner@example.com" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contact_phone" render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <div className="flex items-stretch">
                            <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-3 text-base text-cream-700">
                              +91
                            </span>
                            <Input
                              {...field}
                              value={field.value ?? ''}
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
                    )} />
                    <FormField
                      control={form.control}
                      name="exclusivity"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Exclusivity</FormLabel>
                          <label className="flex h-10 items-center gap-2 rounded-[8px] border border-cream-300 px-3 text-sm text-cream-900">
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(event) => field.onChange(event.target.checked)}
                            />
                            Exclusive principal
                          </label>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormSectionGrid>
                </FormBlock>

                {cohortsEnabled ? (
                  <FormBlock title="Defaults">
                    <FormField
                      control={form.control}
                      name="default_cohort_id"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Default cohort</FormLabel>
                          <FormControl>
                            {cohortsLoading ? (
                              <div className="h-10 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
                            ) : (
                              <StackedPickerField
                                title="Choose a default cohort"
                                items={cohortItems}
                                selectedId={field.value}
                                onSelect={field.onChange}
                                mode={pickerMode}
                                previewCount={INLINE_COHORT_RESULTS}
                                searchPlaceholder="Search cohorts…"
                                emptyLabel="No cohorts match your search."
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
          )}
        </FormOverlayBody>

        <FormOverlayFooter className="justify-end">
          <Button type="button" variant="ghost" onClick={() => dirtyGuard.handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={createBrand.isPending || updateBrand.isPending || !formReady}
            onClick={() => void form.handleSubmit(onSubmit)()}
          >
            {createBrand.isPending || updateBrand.isPending ? 'Saving…' : isEditMode ? 'Save changes' : 'Save brand'}
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
