'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Package, Plus, Search, Upload, X } from 'lucide-react';
import { useForm, useFieldArray, useController, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { MutationButton } from '@/components/ui/mutation-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBrowseUploadField } from '@/components/ui/browse-upload-field';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

import { useSearchMasterProducts, useCreateCustomProduct, useTenantProductCategories } from '@/hooks/useProducts';
import { useDebounce } from '@/hooks/useDebounce';
import { useTenantBrands } from '@/hooks/useBrands';
import { usePriceLists } from '@/hooks/usePriceLists';
import { useRole } from '@/hooks/useRole';
import type { MasterProduct } from '@/hooks/useProducts';
import { UNITS_OF_MEASURE } from '@/constants';
import { cn, formatInrInput, parseInrInput } from '@/lib/utils';
import { apiPost } from '@/lib/api-fetch';

const GST_RATES = ['0', '5', '12', '18', '28'] as const;
const INLINE_RESULTS = 5;

// ─── Form schema ────────────────────────────────────────────────────────────

const AddProductFormSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  // optional at schema level — required for custom products, auto-resolved for imported
  tenant_brand_id: z.string().optional(),
  category_name: z.string().optional(),
  internal_sku: z.string().min(1, 'Internal SKU is required'),
  hsn_code: z.string().optional(),
  gst_rate: z.string().optional(),
  default_uom: z.string().optional(),
  pack_size: z.string().optional(),
  image_urls: z.array(z.string()).default([]),
  description: z.string().optional(),
  mrp: z.string().min(1, 'MRP is required'),
  base_selling_price: z.string().min(1, 'Base selling price is required'),
  cost_price: z.string().optional(),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
});

type AddProductFormValues = z.infer<typeof AddProductFormSchema>;

// ─── Image slot grid ─────────────────────────────────────────────────────────

const MAX_IMAGES = 3;

function ProductImageGrid({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const { inputRef, uploading, canUploadMore, openPicker, handleFiles, removeUrl } =
    useBrowseUploadField({ value, onChange, maxFiles: MAX_IMAGES });

  const uploadingSlots = uploading.slice(0, MAX_IMAGES - value.length);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {Array.from({ length: MAX_IMAGES }).map((_, idx) => {
          const url = value[idx];
          const isUploading = !url && uploadingSlots[idx - value.length];

          if (url) {
            return (
              <div key={url} className="relative flex-1 aspect-square overflow-hidden rounded-xl border border-cream-200 bg-cream-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Product image ${idx + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeUrl(url)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-cream-600 shadow-sm transition-colors hover:text-cream-900"
                  aria-label="Remove image"
                >
                  <X size={12} />
                </button>
                {idx === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white">
                    Primary
                  </span>
                )}
              </div>
            );
          }

          if (isUploading) {
            return (
              <div key={`uploading-${idx}`} className="flex-1 aspect-square flex items-center justify-center rounded-xl border border-dashed border-cream-300 bg-cream-50">
                <Loader2 size={18} className="animate-spin text-cream-400" />
              </div>
            );
          }

          // Empty slot — only the next available slot is clickable to add
          const isNextSlot = idx === value.length + uploadingSlots.length;
          return (
            <button
              key={`empty-${idx}`}
              type="button"
              onClick={canUploadMore ? openPicker : undefined}
              disabled={!canUploadMore}
              className={cn(
                'flex-1 aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed transition-colors',
                isNextSlot && canUploadMore
                  ? 'border-cream-400 bg-cream-50 hover:border-teal-400 hover:bg-teal-50 cursor-pointer'
                  : 'border-cream-200 bg-cream-50/50 cursor-default opacity-50',
              )}
            >
              <Upload size={16} className="text-cream-400" />
              {isNextSlot && (
                <span className="text-[10px] text-cream-500">Add image</span>
              )}
            </button>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        onClick={(e) => ((e.target as HTMLInputElement).value = '')}
      />
      <p className="text-[11px] text-cream-500">JPG, PNG, WebP · Max 5 MB · Up to 3 images</p>
    </div>
  );
}

// ─── INR input ───────────────────────────────────────────────────────────────

function InrInput({
  value,
  onChange,
  placeholder = '0',
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  return (
    <div className="flex items-stretch">
      <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-3 text-[13.5px] text-cream-700 select-none">
        ₹
      </span>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(formatInrInput(e.target.value))}
        placeholder={placeholder}
        className={cn('rounded-l-none font-mono tabular-nums tracking-wide', className)}
      />
    </div>
  );
}

// ─── Master product result row ────────────────────────────────────────────────

function MasterProductRow({ product }: { product: MasterProduct }) {
  const firstImage = product.image_urls?.[0];
  return (
    <div className="flex items-center gap-3">
      {firstImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={firstImage} alt={product.name} className="h-8 w-8 shrink-0 rounded-[8px] border border-cream-200 object-cover" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-cream-200 bg-cream-100 text-cream-400">
          <Package size={14} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-cream-900">{product.name}</p>
        <p className="truncate text-[11.5px] text-cream-700">
          {product.brand_name}{product.category_name ? ` · ${product.category_name}` : ''} · <span className="font-mono">{product.master_sku}</span>
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-teal-50 px-[7px] py-[2px] text-[10px] font-semibold uppercase tracking-[0.06em] text-teal-700">
        Verified
      </span>
    </div>
  );
}

// ─── Read-only chip ───────────────────────────────────────────────────────────

function ReadOnlyChip({ label }: { label: string }) {
  return (
    <div className="flex h-10 items-center rounded-[8px] border border-cream-200 bg-cream-100 px-3 text-[13.5px] text-cream-700">
      {label}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AddProductSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function AddProductSheet({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: AddProductSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === 'boolean';
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  const [selectedMaster, setSelectedMaster] = useState<MasterProduct | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [customProductNameSelected, setCustomProductNameSelected] = useState<string | null>(null);
  const [priceListAmounts, setPriceListAmounts] = useState<Record<string, string>>({});
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const debouncedSearch = useDebounce(inputValue, 300);

  const { isSellerAdmin } = useRole();
  const { data: searchData, isLoading: isSearching } = useSearchMasterProducts(debouncedSearch);
  const { data: brandsData, isLoading: brandsLoading } = useTenantBrands();
  const { data: priceListsData } = usePriceLists();
  const { data: existingCategories = [] } = useTenantProductCategories();
  const createProduct = useCreateCustomProduct();

  const priceLists = useMemo(() => priceListsData?.price_lists ?? [], [priceListsData]);
  const masterResults = useMemo(
    () => (searchData?.products ?? []).slice(0, INLINE_RESULTS),
    [searchData],
  );
  const isPending = inputValue.trim() !== debouncedSearch.trim() || isSearching;

  const form = useForm<AddProductFormValues>({
    resolver: zodResolver(AddProductFormSchema),
    defaultValues: {
      name: '',
      tenant_brand_id: '',
      category_name: '',
      internal_sku: '',
      hsn_code: '',
      gst_rate: '',
      default_uom: '',
      pack_size: '',
      image_urls: [],
      description: '',
      mrp: '',
      base_selling_price: '',
      cost_price: '',
      attributes: [],
    },
  });

  const { fields: attrFields, append: appendAttr, remove: removeAttr } = useFieldArray({
    control: form.control,
    name: 'attributes',
  });

  const { field: imageUrlsField } = useController({ control: form.control, name: 'image_urls' });

  const resetAll = useCallback(() => {
    form.reset();
    setSelectedMaster(null);
    setInputValue('');
    setCustomProductNameSelected(null);
    setPriceListAmounts({});
    setShowCustomCategory(false);
  }, [form]);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      resetAll();
      setOpen(false);
    },
  });

  // When a master product is selected, auto-fill all matching fields
  function applyMasterProduct(product: MasterProduct) {
    setSelectedMaster(product);
    setCustomProductNameSelected(null);
    setInputValue(product.name);
    setShowCustomCategory(false);
    form.reset(
      {
        ...form.getValues(),
        name: product.name,
        internal_sku: product.master_sku,
        hsn_code: product.hsn_code ?? '',
        gst_rate: product.gst_rate != null ? String(product.gst_rate) : '',
        default_uom: product.default_uom ?? '',
        pack_size: product.pack_size != null ? String(product.pack_size) : '',
        image_urls: product.image_urls ?? [],
        description: product.description ?? '',
        category_name: product.category_name ?? '',
      },
      { keepDirty: true },
    );
  }

  function clearMasterProduct() {
    setSelectedMaster(null);
    setInputValue('');
    setShowCustomCategory(false);
    form.setValue('name', '', { shouldDirty: true });
    form.setValue('internal_sku', '');
    form.setValue('hsn_code', '');
    form.setValue('gst_rate', '');
    form.setValue('default_uom', '');
    form.setValue('pack_size', '');
    form.setValue('image_urls', []);
    form.setValue('description', '');
    form.setValue('category_name', '');
  }

  function selectCustomProductName(name: string) {
    setCustomProductNameSelected(name);
    form.setValue('name', name, { shouldDirty: true });
  }

  function clearCustomProductName() {
    setCustomProductNameSelected(null);
    setInputValue('');
    form.setValue('name', '');
  }

  const showDropdown = inputValue.trim().length > 0 && !selectedMaster && !customProductNameSelected;

  // Sync search term to form name field when not imported
  useEffect(() => {
    if (!selectedMaster && !customProductNameSelected) {
      form.setValue('name', inputValue, { shouldDirty: inputValue.length > 0 });
    }
  }, [form, inputValue, selectedMaster, customProductNameSelected]);

  const onSubmit: SubmitHandler<AddProductFormValues> = async (values) => {
    // For custom products, brand selection is required
    if (!selectedMaster && !values.tenant_brand_id) {
      form.setError('tenant_brand_id', { message: 'Brand is required' });
      return;
    }

    const mrp = parseInrInput(values.mrp);
    const bsp = parseInrInput(values.base_selling_price);
    const costPrice = values.cost_price ? parseInrInput(values.cost_price) : null;

    if (!mrp || !bsp) {
      toast.error('Please enter valid MRP and base selling price.');
      return;
    }

    const attributesObj: Record<string, string> = {};
    for (const attr of values.attributes) {
      if (attr.key.trim()) attributesObj[attr.key.trim()] = attr.value;
    }

    try {
      const result = await createProduct.mutateAsync({
        master_product_id: selectedMaster?.id ?? null,
        // For imported products the server auto-resolves tenant_brand_id from the master product's brand
        ...(values.tenant_brand_id ? { tenant_brand_id: values.tenant_brand_id } : {}),
        internal_sku: values.internal_sku,
        name: values.name,
        mrp,
        base_selling_price: bsp,
        cost_price: costPrice ?? undefined,
        default_uom: values.default_uom || undefined,
        pack_size: values.pack_size ? Number(values.pack_size) : undefined,
        hsn_code: values.hsn_code || undefined,
        gst_rate: values.gst_rate ? Number(values.gst_rate) : undefined,
        description: values.description || undefined,
        category_name: values.category_name || undefined,
        attributes: attributesObj,
        image_urls: values.image_urls,
      });

      // Fan-out price list items
      const productId = result.product.id;
      const priceListEntries = Object.entries(priceListAmounts).filter(([, amt]) => amt.trim());
      if (priceListEntries.length > 0) {
        const results = await Promise.allSettled(
          priceListEntries.map(([plId, amtStr]) => {
            const price = parseInrInput(amtStr);
            if (!price) return Promise.resolve();
            return apiPost(`/api/price-lists/${plId}/items`, {
              tenant_product_id: productId,
              price,
            });
          }),
        );
        const failures = results.filter((r) => r.status === 'rejected').length;
        if (failures > 0) {
          toast.error(`Product saved, but ${failures} price list(s) failed to update.`);
        }
      }

      resetAll();
      setOpen(false);
    } catch (err) {
      const e = err as { status?: number; error?: string };
      if (e.status === 409) {
        form.setError('internal_sku', { message: 'This SKU already exists in your product list.' });
      } else {
        toast.error(e.error ?? 'Failed to create product');
      }
    }
  };

  const brands = brandsData?.brands ?? [];

  return (
    <>
      {!hideTrigger ? (
        <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
          <Plus size={16} />
          Add Product
        </Button>
      ) : null}

      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Products"
          title="Add a product"
          description="Start with the name — we'll match it against the master catalog."
        />

        <FormOverlayBody className="space-y-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* State banners */}
              {selectedMaster ? (
                <div className="flex items-center gap-3 rounded-[12px] border border-teal-100 bg-teal-50 px-[14px] py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-teal-100 text-teal-700">
                    <Check size={16} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-cream-900">
                      Imported from master · {selectedMaster.name}
                    </p>
                    <p className="text-[11.5px] text-cream-700">Fields auto-filled — adjust anything before saving.</p>
                  </div>
                  <button
                    type="button"
                    onClick={clearMasterProduct}
                    className="shrink-0 rounded-[6px] px-[6px] py-1 text-[12px] text-cream-700 hover:bg-teal-100 hover:text-teal-900"
                  >
                    Clear
                  </button>
                </div>
              ) : customProductNameSelected ? (
                <div className="flex items-center gap-3 rounded-[12px] border border-ember-100 bg-ember-50 px-[14px] py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-ember-100 text-ember-700">
                    <Plus size={16} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-cream-900">
                      Creating new · {customProductNameSelected}
                    </p>
                    <p className="text-[11.5px] text-cream-700">This product will be added to your catalog.</p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCustomProductName}
                    className="shrink-0 rounded-[6px] px-[6px] py-1 text-[12px] text-cream-700 hover:bg-ember-100 hover:text-ember-900"
                  >
                    Clear
                  </button>
                </div>
              ) : null}

              {/* ── Identity ── */}
              <FormBlock title="Identity">

                {/* Name + search dropdown */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Product name</FormLabel>
                      <FormControl>
                        <Popover open={showDropdown}>
                          <PopoverAnchor asChild>
                            <div className="relative">
                              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700" />
                              <Input
                                {...field}
                                className="pl-8"
                                placeholder="Search master catalog or type a new name"
                                value={inputValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setInputValue(val);
                                  setCustomProductNameSelected(null);
                                  field.onChange(val);
                                }}
                                readOnly={!!selectedMaster || !!customProductNameSelected}
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
                            ) : masterResults.length > 0 ? (
                              <>
                                <div className="px-[14px] pb-[6px] pt-[10px] text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-700">
                                  Master catalog · import &amp; prefill
                                </div>
                                <div className="pb-1">
                                  {masterResults.map((product) => (
                                    <button
                                      key={product.id}
                                      type="button"
                                      onClick={() => applyMasterProduct(product)}
                                      className="mx-1 flex w-[calc(100%-8px)] items-center rounded-[8px] px-3 py-2 text-left transition-colors hover:bg-cream-100"
                                    >
                                      <MasterProductRow product={product} />
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => selectCustomProductName(inputValue)}
                                  className="flex w-full items-center gap-1.5 border-t border-cream-300 bg-cream-50 px-4 py-[10px] text-left text-[12.5px] text-cream-700 transition-colors hover:bg-cream-100"
                                >
                                  <Plus size={13} className="shrink-0 text-cream-700" />
                                  <span>
                                    Create new product{' '}
                                    <strong className="font-medium text-cream-900">&ldquo;{inputValue}&rdquo;</strong>
                                  </span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => selectCustomProductName(inputValue)}
                                className="flex w-full items-center gap-1.5 px-4 py-[10px] text-left text-[12.5px] text-cream-700 transition-colors hover:bg-cream-100"
                              >
                                <Plus size={13} className="shrink-0 text-cream-700" />
                                <span>
                                  No match — create{' '}
                                  <strong className="font-medium text-cream-900">&ldquo;{inputValue}&rdquo;</strong>{' '}
                                  as a new product
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

                {/* Brand */}
                <FormField
                  control={form.control}
                  name="tenant_brand_id"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Brand</FormLabel>
                      <FormControl>
                        {selectedMaster?.brand_name ? (
                          <ReadOnlyChip label={selectedMaster.brand_name} />
                        ) : (
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={brandsLoading}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={brandsLoading ? 'Loading brands…' : 'Select a brand'} />
                            </SelectTrigger>
                            <SelectContent>
                              {brands.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.master_brand?.name ?? b.display_name_override ?? b.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Category */}
                <FormField
                  control={form.control}
                  name="category_name"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        {selectedMaster ? (
                          <ReadOnlyChip label={selectedMaster.category_name ?? 'Uncategorized'} />
                        ) : existingCategories.length > 0 ? (
                          <div className="space-y-2">
                            <Select
                              value={showCustomCategory ? '__custom__' : (field.value || '')}
                              onValueChange={(val) => {
                                if (val === '__custom__') {
                                  setShowCustomCategory(true);
                                  field.onChange('');
                                } else {
                                  setShowCustomCategory(false);
                                  field.onChange(val);
                                }
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                              <SelectContent>
                                {existingCategories.map((cat) => (
                                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                                <SelectItem value="__custom__">+ New category…</SelectItem>
                              </SelectContent>
                            </Select>
                            {showCustomCategory ? (
                              <Input
                                value={field.value || ''}
                                onChange={(e) => field.onChange(e.target.value)}
                                placeholder="Type a new category name"
                                autoFocus
                              />
                            ) : null}
                          </div>
                        ) : (
                          <Input {...field} placeholder="e.g. Wines, Spirits, FMCG" />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormSectionGrid>
                  {/* SKU */}
                  <FormField
                    control={form.control}
                    name="internal_sku"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Internal SKU <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. PRW-750" className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Pack size */}
                  <FormField
                    control={form.control}
                    name="pack_size"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Pack size</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" min="1" step="1" placeholder="e.g. 12" className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* HSN Code */}
                  <FormField
                    control={form.control}
                    name="hsn_code"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>HSN Code</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 2204" className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* GST Rate */}
                  <FormField
                    control={form.control}
                    name="gst_rate"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>GST Rate (%)</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select rate" />
                            </SelectTrigger>
                            <SelectContent>
                              {GST_RATES.map((rate) => (
                                <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Unit of Measure */}
                  <FormField
                    control={form.control}
                    name="default_uom"
                    render={({ field }) => (
                      <FormItem className="space-y-2 md:col-span-2">
                        <FormLabel>Unit of Measure</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {UNITS_OF_MEASURE.map((uom) => (
                                <SelectItem key={uom.value} value={uom.value}>{uom.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSectionGrid>

                {/* Images */}
                <FormItem className="space-y-2">
                  <FormLabel>Product images</FormLabel>
                  <ProductImageGrid
                    value={imageUrlsField.value}
                    onChange={imageUrlsField.onChange}
                  />
                </FormItem>

                {/* Description — last */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={3}
                          placeholder="Optional product description"
                          className="resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormBlock>

              {/* ── Pricing ── */}
              <FormBlock title="Pricing">
                <FormSectionGrid>
                  <FormField
                    control={form.control}
                    name="mrp"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>MRP <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <InrInput
                            id="mrp"
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="0"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="base_selling_price"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel>Base selling price <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <InrInput
                            id="base_selling_price"
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="0"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isSellerAdmin ? (
                    <FormField
                      control={form.control}
                      name="cost_price"
                      render={({ field }) => (
                        <FormItem className="space-y-2 md:col-span-2">
                          <FormLabel>Cost price</FormLabel>
                          <FormControl>
                            <InrInput
                              id="cost_price"
                              value={field.value ?? ''}
                              onChange={field.onChange}
                              placeholder="0 (optional)"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                </FormSectionGrid>
              </FormBlock>

              {/* ── Price Lists ── */}
              {priceLists.length > 0 ? (
                <FormBlock title="Price Lists">
                  <FormSectionGrid>
                    {priceLists.map((pl) => (
                      <FormItem key={pl.id} className="space-y-2">
                        <FormLabel className="truncate">{pl.name}</FormLabel>
                        <InrInput
                          value={priceListAmounts[pl.id] ?? ''}
                          onChange={(v) =>
                            setPriceListAmounts((prev) => ({ ...prev, [pl.id]: v }))
                          }
                          placeholder="—"
                        />
                      </FormItem>
                    ))}
                  </FormSectionGrid>
                </FormBlock>
              ) : null}

              {/* ── Attributes ── */}
              <FormBlock title="Attributes">
                <div className="space-y-2">
                  {attrFields.map((field, idx) => (
                    <div key={field.id} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <Input
                          placeholder="Key (e.g. colour)"
                          {...form.register(`attributes.${idx}.key`)}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="Value (e.g. red)"
                          {...form.register(`attributes.${idx}.value`)}
                          className="font-mono text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAttr(idx)}
                        className="shrink-0 text-cream-500 hover:text-red-600"
                        aria-label="Remove attribute"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendAttr({ key: '', value: '' })}
                  className="mt-1 gap-1 text-cream-700"
                >
                  <Plus size={14} />
                  Add attribute
                </Button>
              </FormBlock>

            </form>
          </Form>
        </FormOverlayBody>

        <FormOverlayFooter className="justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => dirtyGuard.handleOpenChange(false)}
            disabled={createProduct.isPending}
          >
            Cancel
          </Button>
          <MutationButton
            type="button"
            isPending={createProduct.isPending}
            pendingLabel="Saving…"
            onClick={() => void form.handleSubmit(onSubmit)()}
          >
            Save product
          </MutationButton>
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
