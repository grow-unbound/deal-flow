'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, RotateCcw, Save, Search, Send, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EntityAvatar, PageWrap } from '@/components/seller/layout';
import {
  ComposerBasicsField,
  ComposerBasicsStrip,
  ComposerBodyGrid,
  ComposerCheckboxCell,
  ComposerBreadcrumbs,
  ComposerFooterBar,
  ComposerMainCard,
  ComposerSelectableRow,
  ComposerShell,
  ComposerSidebarCard,
  ComposerTitleRow,
} from '@/components/seller/composer/ComposerLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DiscardChangesDialog, useDirtyCloseGuard } from '@/components/ui/form-overlay';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useCatalogComposerBootstrap,
  useCatalogComposerDetail,
  useSaveCatalogComposer,
  type CatalogComposerProduct,
} from '@/hooks/useCatalogs';
import { cn, formatDate, formatInr } from '@/lib/utils';
import { isoDateInput } from '@/lib/date-utils';
import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';
import { CatalogComposerPayloadSchema, type CatalogComposerAvailability, type CatalogComposerTag } from '@/lib/zod';

type ComposerMode = 'create' | 'edit';

type FilterOption = {
  name: string;
  count: number;
};

type CatalogComposerFieldErrors = {
  name?: string;
  cohortId?: string;
  validFrom?: string;
  validTo?: string;
  products?: string;
};

const AVAILABILITY_OPTIONS: Array<{ value: CatalogComposerAvailability; label: string }> = [
  { value: 'new_in_stock_today', label: 'New In Stock today' },
  { value: 'in_stock_only', label: 'In Stock only' },
  { value: 'low_stock_only', label: 'Low Stock only' },
  { value: 'old_stock', label: 'Old Stock' },
  { value: 'show_everything', label: 'Show everything' },
];

const TAG_OPTIONS: Array<{ value: CatalogComposerTag | 'auto'; label: string }> = [
  { value: 'auto', label: 'Automatic tag' },
  { value: 'new', label: 'Mark as New' },
  { value: 'new_stock', label: 'Mark as New Stock' },
  { value: 'old_stock', label: 'Mark as Old Stock' },
];

const UNCATEGORIZED_FILTER_LABEL = 'Uncategorized';
const ALL_BUYERS_SCOPE_VALUE = '__all_buyers__';

function normalizeFilterLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || UNCATEGORIZED_FILTER_LABEL;
}

function buildFilterOptions(values: Array<string | null | undefined>): FilterOption[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = normalizeFilterLabel(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getInitials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'CT';
}

function matchesAvailability(product: CatalogComposerProduct, availability: CatalogComposerAvailability) {
  if (availability === 'show_everything') return true;
  if (availability === 'in_stock_only') return product.qty_available > 0;
  if (availability === 'low_stock_only') return product.qty_available > 0 && product.reorder_point > 0 && product.qty_available <= product.reorder_point;
  if (availability === 'old_stock') return product.tag === 'old_stock';
  return product.stock_added_today;
}

function tagLabel(tag: CatalogComposerProduct['tag']) {
  if (tag === 'new') return 'NEW';
  if (tag === 'new_stock') return 'NEW STOCK';
  if (tag === 'old_stock') return 'OLD STOCK';
  return null;
}

function stockTextClasses(tone: CatalogComposerProduct['stock_tone']) {
  if (tone === 'success') return 'text-teal-700';
  if (tone === 'warning') return 'text-amber-700';
  return 'text-cream-700';
}

function tagPillClasses(tag: CatalogComposerProduct['tag']) {
  if (tag === 'new' || tag === 'new_stock') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-cream-300 bg-cream-100 text-cream-700';
}

function BuyerCountPill({ count }: { count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-cream-300 bg-cream-100 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-cream-700">
      {count} buyers
    </span>
  );
}

export function CatalogComposerSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading catalog composer"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 animate-pulse rounded-[9px] bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
          </div>
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-300 bg-white last:border-r-0" />
          ))}
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        </div>
      </div>
      <div className="sticky bottom-0 z-10 mt-4 h-20 shrink-0 animate-pulse rounded-[14px] border border-cream-300 bg-white" />
    </div>
  );
}

export function CatalogComposer({
  mode,
  catalogId,
}: {
  mode: ComposerMode;
  catalogId?: string;
}) {
  const router = useRouter();
  const saveMutation = useSaveCatalogComposer(catalogId);
  const { data: bootstrap, isLoading: bootstrapLoading, isError: bootstrapError } = useCatalogComposerBootstrap();
  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
  } = useCatalogComposerDetail(mode === 'edit' ? catalogId ?? '' : '');

  const products = bootstrap?.products ?? [];
  const cohorts = bootstrap?.cohorts ?? [];
  const buyerCount = bootstrap?.buyer_count ?? 0;
  const detailComposer = detail?.composer;
  const isLoading = bootstrapLoading || (mode === 'edit' && detailLoading);
  const isError = bootstrapError || (mode === 'edit' && detailError);

  const brandOptions = useMemo(() => buildFilterOptions(products.map((product) => product.brand_name)), [products]);
  const categoryOptions = useMemo(
    () => buildFilterOptions(products.map((product) => product.category_name)),
    [products],
  );
  const allBrandNames = useMemo(() => brandOptions.map((option) => option.name), [brandOptions]);
  const allCategoryNames = useMemo(() => categoryOptions.map((option) => option.name), [categoryOptions]);

  const [name, setName] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [validFrom, setValidFrom] = useState(isoDateInput(new Date()));
  const [validTo, setValidTo] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availability, setAvailability] = useState<CatalogComposerAvailability>('show_everything');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialSelectionIds, setInitialSelectionIds] = useState<Set<string>>(new Set());
  const [tagOverrides, setTagOverrides] = useState<Record<string, CatalogComposerTag | null>>({});
  const [initialTagOverrides, setInitialTagOverrides] = useState<Record<string, CatalogComposerTag | null>>({});
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [didInit, setDidInit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CatalogComposerFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | 'draft' | 'publish'>(null);

  useEffect(() => {
    if (didInit || products.length === 0) return;
    if (mode === 'edit') {
      if (!detailComposer) return;

      const nextBrands = detailComposer.filters.brand_names.length > 0 ? detailComposer.filters.brand_names : allBrandNames;
      const nextCategories = detailComposer.filters.category_names.length > 0 ? detailComposer.filters.category_names : allCategoryNames;
      const nextSelectedIds = new Set(detailComposer.items.map((item) => item.tenant_product_id));

      setName(detailComposer.name);
      setCohortId(detailComposer.scope_type === 'all' ? ALL_BUYERS_SCOPE_VALUE : (detailComposer.cohort_id ?? ''));
      setValidFrom(detailComposer.valid_from.slice(0, 10));
      setValidTo(detailComposer.valid_to ? detailComposer.valid_to.slice(0, 10) : '');
      setSelectedBrands(nextBrands);
      setSelectedCategories(nextCategories);
      setAvailability(detailComposer.filters.availability);
      setSelectedIds(nextSelectedIds);
      setTagOverrides(detailComposer.tag_overrides ?? {});
      setInitialTagOverrides(detailComposer.tag_overrides ?? {});
      setInitialSelectionIds(new Set(nextSelectedIds));
      setDidInit(true);
      return;
    }

    const nextSelectedIds = new Set(products.map((product) => product.id));
    setName('');
    setCohortId(cohorts[0]?.id ?? ALL_BUYERS_SCOPE_VALUE);
    setValidFrom(isoDateInput(new Date()));
    setValidTo('');
    setSelectedBrands(allBrandNames);
    setSelectedCategories(allCategoryNames);
    setAvailability('show_everything');
    setSelectedIds(nextSelectedIds);
    setTagOverrides({});
    setInitialTagOverrides({});
    setInitialSelectionIds(new Set(nextSelectedIds));
    setDidInit(true);
  }, [allBrandNames, allCategoryNames, cohorts, detailComposer, didInit, mode, products]);

  const effectiveTag = (product: CatalogComposerProduct) => tagOverrides[product.id] ?? product.tag;

  const filteredProducts = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    const allBrandsSelected = selectedBrands.length === allBrandNames.length;
    const allCategoriesSelected = selectedCategories.length === allCategoryNames.length;

    return products.filter((product) => {
      const brandName = normalizeFilterLabel(product.brand_name);
      const categoryName = normalizeFilterLabel(product.category_name);
      const matchesBrand = allBrandsSelected || selectedBrands.includes(brandName);
      const matchesCategory = allCategoriesSelected || selectedCategories.includes(categoryName);
      const productWithEffectiveTag = { ...product, tag: tagOverrides[product.id] ?? product.tag };
      const matchesAvailabilityValue = matchesAvailability(productWithEffectiveTag, availability);
      if (!matchesBrand || !matchesCategory || !matchesAvailabilityValue) return false;
      if (!lowered) return true;
      return (
        product.display_name.toLowerCase().includes(lowered) ||
        product.internal_sku.toLowerCase().includes(lowered) ||
        brandName.toLowerCase().includes(lowered)
      );
    });
  }, [allBrandNames.length, allCategoryNames.length, availability, products, search, selectedBrands, selectedCategories, tagOverrides]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.has(product.id)),
    [products, selectedIds],
  );

  const filteredSelectedProducts = useMemo(
    () => filteredProducts.filter((product) => selectedIds.has(product.id)),
    [filteredProducts, selectedIds],
  );
  const selectedVisibleCount = filteredSelectedProducts.length;

  const hiddenByFilters = Math.max(0, products.length - filteredProducts.length);
  const hiddenSelectedCount = Math.max(0, selectedProducts.length - filteredSelectedProducts.length);
  const selectedBrandCount = new Set(filteredSelectedProducts.map((product) => normalizeFilterLabel(product.brand_name))).size;
  const inStockCount = filteredSelectedProducts.filter((product) => product.qty_available > 0).length;
  const newCount = filteredSelectedProducts.filter((product) => effectiveTag(product) === 'new').length;
  const newStockCount = filteredSelectedProducts.filter((product) => effectiveTag(product) === 'new_stock').length;
  const oldStockCount = filteredSelectedProducts.filter((product) => effectiveTag(product) === 'old_stock').length;
  const selectedCohort = cohorts.find((cohort) => cohort.id === cohortId) ?? null;
  const isAllBuyersScope = cohortId === ALL_BUYERS_SCOPE_VALUE;
  const selectedAudienceName = isAllBuyersScope ? 'All Buyers' : (selectedCohort?.name ?? 'Choose a cohort');
  const selectedAudienceCount = isAllBuyersScope ? buyerCount : (selectedCohort?.member_count ?? 0);
  const overriddenTagCount = Object.values(tagOverrides).filter((value) => value != null).length;
  const pendingPublishSummary = [
    { label: 'Name', value: name || 'Untitled catalog' },
    { label: 'Audience', value: `${selectedAudienceName} (${selectedAudienceCount} buyers)` },
    { label: 'Products', value: `${selectedVisibleCount} selected · ${selectedBrandCount} brands` },
    { label: 'Validity', value: validFrom ? `${formatDate(validFrom)} → ${validTo ? formatDate(validTo) : 'Open ended'}` : '—' },
  ];

  const serializedState = useMemo(
    () => JSON.stringify({
      name,
      cohortId,
      validFrom,
      validTo,
      selectedBrands,
      selectedCategories,
      availability,
      selectedIds: Array.from(selectedIds).sort(),
      tagOverrides,
    }),
    [availability, cohortId, name, selectedBrands, selectedCategories, selectedIds, tagOverrides, validFrom, validTo],
  );

  useEffect(() => {
    if (!didInit || initialSnapshot) return;
    setInitialSnapshot(serializedState);
  }, [didInit, initialSnapshot, serializedState]);

  const isDirty = didInit && Boolean(initialSnapshot) && serializedState !== initialSnapshot;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const closeTarget = mode === 'edit' && catalogId ? `/catalogs/${catalogId}` : '/catalogs';
  const dirtyGuard = useDirtyCloseGuard({
    isDirty,
    onConfirmClose: () => router.push(closeTarget),
  });

  function toggleMany(current: string[], allValues: string[], setter: (values: string[]) => void) {
    setter(current.length === allValues.length ? [] : allValues);
  }

  function clearFieldError(field: keyof CatalogComposerFieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function toggleVisibleSelection(checked: boolean) {
    const visibleIds = filteredProducts.map((product) => product.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        visibleIds.forEach((id) => next.add(id));
      } else {
        visibleIds.forEach((id) => next.delete(id));
      }
      return next;
    });
    if (checked || selectedIds.size > visibleIds.length) clearFieldError('products');
  }

  function resetOverrides() {
    setTagOverrides({ ...initialTagOverrides });
  }

  function applyTagOverride(ids: string[], value: CatalogComposerTag | 'auto') {
    setTagOverrides((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        if (value === 'auto') delete next[id];
        else next[id] = value;
      });
      return next;
    });
  }

  function buildSavePayload(saveMode: 'draft' | 'publish') {
    return {
      name: name.trim(),
      scope_type: isAllBuyersScope ? 'all' : 'cohort',
      cohort_id: isAllBuyersScope ? null : cohortId || null,
      valid_from: validFrom ? `${validFrom}T00:00:00` : '',
      valid_to: validTo ? `${validTo}T23:59:59` : undefined,
      filters: {
        brand_names: selectedBrands,
        category_names: selectedCategories,
        availability,
      },
      tag_overrides: tagOverrides,
      items: selectedProducts.map((product, index) => ({
        tenant_product_id: product.id,
        display_order: index,
      })),
      save_mode: saveMode,
    };
  }

  function validateBeforeSave(saveMode: 'draft' | 'publish') {
    const payload = buildSavePayload(saveMode);
    const nextErrors: CatalogComposerFieldErrors = {};
    const parsed = CatalogComposerPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? '');
        if (path === 'name') nextErrors.name = issue.message;
        else if (path === 'cohort_id') nextErrors.cohortId = issue.message;
        else if (path === 'valid_from') nextErrors.validFrom = issue.message;
        else if (path === 'valid_to') nextErrors.validTo = issue.message;
      }
    }

    if (payload.items.length === 0) {
      nextErrors.products = 'Select at least one product to save this catalog.';
    }

    setFieldErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, payload: parsed.success ? parsed.data : null };
  }

  async function handleSave(saveMode: 'draft' | 'publish') {
    setSubmitError(null);
    const { isValid, payload } = validateBeforeSave(saveMode);
    if (!isValid || !payload) return;

    try {
      const result = await saveMutation.mutateAsync(payload);
      router.push(`/catalogs/${result.catalog.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save catalog');
    }
  }

  if (isError || (mode === 'edit' && !detail?.composer)) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 py-6">
        <div className="rounded-[18px] border border-danger-200 bg-danger-50 p-5 text-[13px] text-danger-700">
          We couldn&apos;t load this catalog composer right now.
        </div>
      </div>
    );
  }

  if (isLoading || !didInit) {
    return <CatalogComposerSkeleton />;
  }

  const isPublishedEdit = mode === 'edit' && detail?.composer?.live_status === 'published';
  const createSubtitle = 'Curate which products a cohort sees. The catalog controls visibility, availability, and what gets marked new.';
  const editSubtitle = isPublishedEdit
    ? 'You are staging edits for a live catalog. Save keeps current buyer assignments unchanged until you publish updates.'
    : 'You are editing a draft catalog. Update the cohort-facing assortment, then review the summary before publishing.';

  async function handleActionClick(action: 'draft' | 'publish') {
    if (isPublishedEdit) {
      setConfirmAction(action);
      return;
    }
    await handleSave(action);
  }

  return (
    <>
      <PageWrap className={cn('flex flex-col', composerPageMinHeightClass, 'pt-7 pb-6')}>
        <ComposerShell>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
          <ComposerBreadcrumbs
            items={[
              { label: 'Catalogs', href: '/catalogs' },
              { label: mode === 'edit' ? detail?.header.name ?? 'Edit catalog' : 'New catalog', current: true },
            ]}
          />

          <ComposerTitleRow
            title={mode === 'edit' ? 'Edit catalog' : 'Add a catalog'}
            subtitle={mode === 'edit' ? editSubtitle : createSubtitle}
            status={{
              label: mode === 'edit' && detail?.composer?.status === 'published' ? 'Live' : 'Draft',
              tone: mode === 'edit' && detail?.composer?.status === 'published' ? 'live' : 'draft',
            }}
            actions={
              <>
                <Button type="button" variant="ghost"  onClick={() => dirtyGuard.handleOpenChange(false)}>
                  <X className="h-3.5 w-3.5" />
                  Close
                </Button>
              </>
            }
          />

          <ComposerBasicsStrip columnsClassName="lg:grid-cols-[1.4fr_1fr_1fr]">
            <ComposerBasicsField label="Name">
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  clearFieldError('name');
                  setSubmitError(null);
                }}
                placeholder="e.g. Summer ’26 · New Arrivals"
                error={fieldErrors.name}
                className="h-auto border-0 bg-transparent px-0 py-0 font-medium text-[14px] text-cream-950 shadow-none focus-visible:ring-0"
              />
            </ComposerBasicsField>

            <ComposerBasicsField label="Cohort">
              <Select
                value={cohortId}
                onValueChange={(value) => {
                  setCohortId(value);
                  clearFieldError('cohortId');
                  setSubmitError(null);
                }}
              >
                <SelectTrigger
                  error={fieldErrors.cohortId}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-[14px] font-medium text-cream-950 shadow-none focus:ring-0"
                >
                  {cohortId ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                      <div className="min-w-0 truncate">{selectedAudienceName}</div>
                      <BuyerCountPill count={selectedAudienceCount} />
                    </div>
                  ) : (
                    <SelectValue placeholder="Pick a cohort" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BUYERS_SCOPE_VALUE} className="py-2.5">
                    <div className="flex min-w-0 items-center justify-between gap-4 pr-6">
                      <div className="min-w-0 truncate font-medium">All Buyers</div>
                      <BuyerCountPill count={buyerCount} />
                    </div>
                  </SelectItem>
                  {cohorts.map((cohort) => (
                    <SelectItem key={cohort.id} value={cohort.id} className="py-2.5">
                      <div className="flex min-w-0 items-center justify-between gap-4 pr-6">
                        <div className="min-w-0 truncate font-medium">{cohort.name}</div>
                        <BuyerCountPill count={cohort.member_count} />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ComposerBasicsField>

            <ComposerBasicsField label="Validity">
              <DateRangePicker
                validFrom={validFrom}
                validTo={validTo}
                error={fieldErrors.validFrom && !fieldErrors.validTo ? fieldErrors.validFrom : undefined}
                onValidFromChange={(next) => {
                  setValidFrom(next);
                  clearFieldError('validFrom');
                  clearFieldError('validTo');
                  setSubmitError(null);
                }}
                onValidToChange={(next) => {
                  setValidTo(next);
                  clearFieldError('validTo');
                  setSubmitError(null);
                }}
              />
              {fieldErrors.validTo ? <p className="mt-1 text-[11.5px] text-danger-500">{fieldErrors.validTo}</p> : null}
            </ComposerBasicsField>
          </ComposerBasicsStrip>

          {Object.keys(fieldErrors).length > 0 ? (
            <Alert variant="warning">
              <AlertTitle>Fix the highlighted fields</AlertTitle>
              <AlertDescription>
                {Array.from(new Set(Object.values(fieldErrors).filter(Boolean))).join(' ')}
              </AlertDescription>
            </Alert>
          ) : null}

          {submitError ? (
            <Alert variant="danger">
              <AlertTitle>Couldn&apos;t save catalog</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}

          {isPublishedEdit ? (
            <Alert variant="warning">
              <AlertTitle>Editing a live catalog</AlertTitle>
              <AlertDescription>
                Save changes keeps the current buyer-facing catalog untouched. Publish updates pushes this staged version to the mapped cohort or buyers.
              </AlertDescription>
            </Alert>
          ) : null}

          <ComposerBodyGrid
            left={
              <ComposerSidebarCard>
                <div className="space-y-5">
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Brand</h3>
                      <button
                        type="button"
                        className="text-[12px] font-medium text-teal-700 hover:text-teal-800"
                        onClick={() => toggleMany(selectedBrands, allBrandNames, setSelectedBrands)}
                      >
                        {selectedBrands.length === allBrandNames.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {brandOptions.map((brand) => (
                        <label key={brand.name} className="flex items-center justify-between gap-3 text-[13px] text-cream-900">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedBrands.includes(brand.name)}
                              onChange={(event) => {
                                setSelectedBrands((current) =>
                                  event.target.checked
                                    ? [...current, brand.name]
                                    : current.filter((item) => item !== brand.name),
                                );
                              }}
                              className="accent-teal-500"
                            />
                            <span>{brand.name}</span>
                          </span>
                          <span className="font-mono text-[11px] text-cream-700">{brand.count}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Product Category</h3>
                      <button
                        type="button"
                        className="text-[12px] font-medium text-teal-700 hover:text-teal-800"
                        onClick={() => toggleMany(selectedCategories, allCategoryNames, setSelectedCategories)}
                      >
                        {selectedCategories.length === allCategoryNames.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {categoryOptions.map((category) => (
                        <label key={category.name} className="flex items-center justify-between gap-3 text-[13px] text-cream-900">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(category.name)}
                              onChange={(event) => {
                                setSelectedCategories((current) =>
                                  event.target.checked
                                    ? [...current, category.name]
                                    : current.filter((item) => item !== category.name),
                                );
                              }}
                              className="accent-teal-500"
                            />
                            <span>{category.name}</span>
                          </span>
                          <span className="font-mono text-[11px] text-cream-700">{category.count}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Availability</h3>
                    <div className="space-y-2">
                      {AVAILABILITY_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-[13px] text-cream-900">
                          <input
                            type="radio"
                            name="catalog-availability"
                            checked={availability === option.value}
                            onChange={() => setAvailability(option.value)}
                            className="accent-teal-500"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>
              </ComposerSidebarCard>
            }
            center={
              <ComposerMainCard>
                <div className="flex flex-wrap items-center gap-3 border-b border-cream-300 bg-cream-50 px-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold text-cream-900">
                      {filteredProducts.length} products match the filters
                    </div>
                    <div className="text-[12px] text-cream-700">
                      Uncheck products to exclude.
                    </div>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="flex min-w-[240px] items-center gap-2 rounded-[8px] border border-cream-300 bg-white px-3 py-2 text-[13px] text-cream-700">
                      <Search className="h-4 w-4 text-cream-600" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search SKU or product name"
                        className="w-full bg-transparent outline-none placeholder:text-cream-600"
                      />
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="secondary">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Bulk adjust
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 border-cream-300 bg-white p-2">
                        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-700">
                          Apply to {selectedProducts.length} selected rows
                        </div>
                        <div className="space-y-1">
                          {TAG_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className="flex w-full items-center justify-between rounded-[8px] px-2 py-2 text-left text-[13px] text-cream-900 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => applyTagOverride(Array.from(selectedIds), option.value)}
                              disabled={selectedProducts.length === 0}
                            >
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button type="button" variant="ghost" onClick={resetOverrides} disabled={overriddenTagCount === 0}>
                      Reset overrides
                    </Button>
                  </div>
                </div>

                {fieldErrors.products ? (
                  <div className="border-b border-cream-300 px-4 py-3">
                    <Alert variant="warning">
                      <AlertDescription>{fieldErrors.products}</AlertDescription>
                    </Alert>
                  </div>
                ) : null}

                {filteredProducts.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center px-8 py-16 text-[13px] text-cream-700">
                    No products match the current filters and search.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full border-collapse text-[13px]">
                      <thead className="sticky top-0 z-[1] bg-cream-50">
                        <tr>
                          <th className="w-9 border-b border-cream-300 px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">
                            <input
                              type="checkbox"
                              checked={filteredProducts.length > 0 && selectedVisibleCount === filteredProducts.length}
                              onChange={(event) => toggleVisibleSelection(event.target.checked)}
                              className="accent-teal-500"
                            />
                          </th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Product Name</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Brand</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Stock</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">MRP</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Selling Base Price</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Units Sold MTD</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Days Cover</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-700">Tag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((product, index) => {
                          const isSelected = selectedIds.has(product.id);
                          const currentTag = effectiveTag(product);
                          const tag = tagLabel(currentTag);
                          return (
                            <ComposerSelectableRow
                              key={product.id}
                              checked={isSelected}
                              onCheckedChange={(nextChecked) => {
                                setSelectedIds((current) => {
                                  const next = new Set(current);
                                  if (nextChecked) next.add(product.id);
                                  else next.delete(product.id);
                                  return next;
                                });
                                if (nextChecked) clearFieldError('products');
                              }}
                            >
                              <ComposerCheckboxCell
                                checked={isSelected}
                                onCheckedChange={(nextChecked) => {
                                  setSelectedIds((current) => {
                                    const next = new Set(current);
                                    if (nextChecked) next.add(product.id);
                                    else next.delete(product.id);
                                    return next;
                                  });
                                  if (nextChecked) clearFieldError('products');
                                }}
                              />
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <EntityAvatar
                                    initials={getInitials(product.brand_name || product.display_name)}
                                    hue={index % 3 === 1 ? 'ember' : index % 3 === 2 ? 'cream' : 'teal'}
                                    size={32}
                                    className="rounded-[8px]"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-[13.5px] font-medium text-cream-900">{product.display_name}</p>
                                    <p className="mt-0.5 truncate font-mono text-[11px] text-cream-700">{product.internal_sku}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-cream-900">{product.brand_name}</td>
                              <td className={cn('px-4 py-3 text-right font-mono font-medium', stockTextClasses(product.stock_tone))}>
                                {product.stock_label}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{product.mrp != null ? formatInr(product.mrp) : '—'}</td>
                              <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{product.base_selling_price != null ? formatInr(product.base_selling_price) : '—'}</td>
                              <td className="px-4 py-3 text-right font-mono text-cream-900">{product.units_mtd}</td>
                              <td className="px-4 py-3 text-right font-mono text-cream-900">{product.days_cover == null ? '—' : `${product.days_cover}d`}</td>
                              <td className="px-4 py-3 text-right">
                                <Select
                                  value={tagOverrides[product.id] ?? 'auto'}
                                  onValueChange={(value) => applyTagOverride([product.id], value as CatalogComposerTag | 'auto')}
                                >
                                  <SelectTrigger
                                    className="ml-auto inline-flex h-auto min-w-[132px] items-center justify-end gap-1.5 border-0 bg-transparent px-0 py-0 text-right shadow-none focus:ring-0"
                                    data-row-click-ignore="true"
                                  >
                                    <span>
                                      {tag ? (
                                        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]', tagPillClasses(currentTag))}>
                                          {tag}
                                        </span>
                                      ) : (
                                        <span className="text-cream-500">—</span>
                                      )}
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent align="end">
                                    {TAG_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            </ComposerSelectableRow>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </ComposerMainCard>
            }
            right={
              <ComposerSidebarCard>
                <div className="flex h-full flex-col gap-4">
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Catalog summary</h3>
                    <div className="mt-4">
                      <p className="font-display text-[18px] font-medium tracking-[-0.005em] text-cream-900">
                        {name || 'Untitled catalog'}
                      </p>
                      <p className="mt-1 text-[12px] text-cream-700">
                        Publishes to {selectedAudienceName} ({selectedAudienceCount} buyers)
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-cream-300" />

                  <div className="space-y-3">
                    <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-[12px] leading-[1.5] text-cream-700">
                      <div className="font-medium text-cream-900">{selectedAudienceName}</div>
                      <div className="mt-1">
                        will see: {selectedVisibleCount} products across {selectedBrandCount} brands.
                      </div>
                      {hiddenSelectedCount > 0 ? <div className="mt-1">{hiddenSelectedCount} products are outside the current filters.</div> : null}
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">Products</span>
                      <span className="font-mono font-medium text-cream-900">{selectedVisibleCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">Brands</span>
                      <span className="font-mono font-medium text-cream-900">{selectedBrandCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">In stock</span>
                      <span className="font-mono font-medium text-cream-900">{inStockCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">New</span>
                      <span className="font-mono font-medium text-cream-900">{newCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">New Stock</span>
                      <span className="font-mono font-medium text-cream-900">{newStockCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">Old Stock</span>
                      <span className="font-mono font-medium text-cream-900">{oldStockCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">Manual tag overrides</span>
                      <span className="font-mono font-medium text-cream-900">{overriddenTagCount}</span>
                    </div>
                  </div>

                  <div className="h-px bg-cream-300" />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">Reach</span>
                      <span className="font-mono font-medium text-cream-900">{selectedAudienceCount} buyers</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">Valid from</span>
                      <span className="font-mono font-medium text-cream-900">{validFrom ? formatDate(validFrom) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-cream-700">Valid until</span>
                      <span className="font-mono font-medium text-cream-900">{validTo ? formatDate(validTo) : 'Open ended'}</span>
                    </div>
                  </div>

                  {isPublishedEdit ? (
                    <>
                      <div className="h-px bg-cream-300" />
                      <div className="space-y-2">
                        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Next publish</h4>
                        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3">
                          <div className="space-y-2 text-[12px] leading-[1.5] text-amber-900">
                            {pendingPublishSummary.map((item) => (
                              <div key={item.label} className="flex items-start justify-between gap-4">
                                <span className="text-amber-700">{item.label}</span>
                                <span className="max-w-[190px] text-right font-medium">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className={cn(
                    'mt-auto rounded-[10px] px-3 py-3 text-[12px] leading-[1.5]',
                    isPublishedEdit ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'border border-teal-200 bg-teal-50 text-teal-700',
                  )}>
                    <div className="flex gap-2">
                      {isPublishedEdit ? (
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      ) : (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                      )}
                      <span>
                        {isPublishedEdit
                          ? 'Save keeps these edits staged privately. Publish updates is the moment mapped buyers or cohorts see the new catalog.'
                          : 'Ready to publish. Buyers see this catalog as soon as it goes live.'}
                        {overriddenTagCount > 0 ? ` ${overriddenTagCount} product tag override${overriddenTagCount === 1 ? '' : 's'} will be preserved.` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </ComposerSidebarCard>
            }
          />

          </div>

          <ComposerFooterBar>
            <div className="flex items-center gap-3">
              <div className={cn('inline-flex items-center gap-2 text-[12px]', isDirty ? 'text-ember-700' : 'text-cream-700')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', isDirty ? 'bg-ember-400' : 'bg-success-500')} />
                {isDirty
                  ? 'Unsaved changes'
                  : isPublishedEdit
                    ? (detail?.composer?.has_unpublished_changes ? 'Staged changes saved · buyers still see the live catalog' : 'Live catalog · no staged changes')
                    : mode === 'edit'
                      ? 'Draft saved · auto-resumes if you close'
                      : 'Auto-saves as you type'}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => dirtyGuard.handleOpenChange(false)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {mode === 'edit' ? 'Revert changes' : 'Discard draft'}
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => void handleActionClick('draft')}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {isPublishedEdit ? 'Save changes' : mode === 'edit' ? 'Save as draft' : 'Save & close'}
                </Button>
                <Button
                  type="button"
                  className="cockpit-btn cockpit-btn-primary"
                  onClick={() => void handleActionClick('publish')}
                  disabled={saveMutation.isPending}
                >
                  <Send className="h-3.5 w-3.5" />
                  {mode === 'edit' ? 'Publish updates' : 'Publish catalog'}
                </Button>
              </div>
            </div>
          </ComposerFooterBar>
        </ComposerShell>
      </PageWrap>

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />

      <Dialog open={confirmAction !== null} onOpenChange={(open) => setConfirmAction(open ? confirmAction : null)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'draft' ? 'Save unpublished changes?' : 'Publish updates to buyers?'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'draft'
                ? 'This stores your edits as a private draft. Mapped buyers and cohorts will keep seeing the current live catalog until you publish updates.'
                : 'This replaces the live catalog for the currently mapped buyers or cohort. Publish only when the updated assortment is ready to go live.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-4 text-[13px] leading-6 text-cream-700">
            {confirmAction === 'draft'
              ? 'You can come back later, review these staged changes, and publish when ready.'
              : `${selectedAudienceCount} buyers in ${selectedAudienceName} will see this updated catalog once you confirm.`}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!confirmAction) return;
                await handleSave(confirmAction);
                setConfirmAction(null);
              }}
              disabled={saveMutation.isPending}
            >
              {confirmAction === 'draft' ? <Save className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {confirmAction === 'draft' ? 'Save changes' : 'Publish updates'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
