'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Percent, RotateCcw, Save, Search, Send, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  useCatalogComposerProducts,
  useComposerPublishPreview,
  useSaveCatalogComposer,
  type CatalogComposerProduct,
  type CatalogPublishPreviewResponse,
} from '@/hooks/useCatalogs';
import { SellerBuyerPickerOverlay } from '@/components/seller/shared/SellerBuyerPickerOverlay';
import { PublishCampaignDialog, type PublishCampaignDialogMode } from '@/components/seller/catalogs/detail/PublishCampaignDialog';
import { CatalogComposerSkeleton as SharedCatalogComposerSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { cn, formatDate, formatNumberInput, formatNumberValue, parseNumberInput } from '@/lib/utils';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { isoDateInput } from '@/lib/date-utils';
import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';
import {
  CatalogComposerPayloadSchema,
  type CatalogComposerAvailability,
  type CatalogComposerPriceSource,
  type CatalogComposerPricingMode,
  type CatalogComposerTag,
} from '@/lib/zod';
import { toast } from 'sonner';

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
  priceListId?: string;
  buyers?: string;
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
  { value: 'none', label: 'No Tag' },
  { value: 'new', label: 'Mark as New' },
  { value: 'new_stock', label: 'Mark as New Stock' },
  { value: 'old_stock', label: 'Mark as Old Stock' },
];

const UNCATEGORIZED_FILTER_LABEL = 'Uncategorized';
const ALL_BUYERS_SCOPE_VALUE = '__all_buyers__';
const SELECT_BUYERS_SCOPE_VALUE = '__select_buyers__';
const SETUP_CAMPAIGN_PRICES_VALUE = '__setup_campaign_prices__';
type PricingMode = CatalogComposerPricingMode;

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
  if (tag === 'none') return null;
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
    <span className="inline-flex shrink-0 items-center rounded-full border border-cream-300 bg-cream-100 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-cream-700">
      {count} buyers
    </span>
  );
}

function priceListStatusPillClasses(status: 'active' | 'draft') {
  if (status === 'active') return 'border-teal-200 bg-teal-50 text-teal-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function CatalogComposerSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading campaign composer"
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

  const cohorts = bootstrap?.cohorts ?? [];
  const priceLists = bootstrap?.price_lists ?? [];
  const priceListItems = bootstrap?.price_list_items ?? [];
  const buyerCount = bootstrap?.buyer_count ?? 0;
  const detailComposer = detail?.composer;
  // Server-provided facets: accurate counts over full product dataset, not just display page
  const brandOptions = useMemo<FilterOption[]>(
    () =>
      bootstrap?.product_filters?.brands
        ? bootstrap.product_filters.brands.map((f: { id: string; label: string; count: number }) => ({ name: f.label, count: f.count }))
        : buildFilterOptions((bootstrap?.products ?? []).map((p) => p.brand_name)),
    [bootstrap?.product_filters?.brands, bootstrap?.products],
  );
  const categoryOptions = useMemo<FilterOption[]>(
    () =>
      bootstrap?.product_filters?.categories
        ? bootstrap.product_filters.categories.map((f: { id: string; label: string; count: number }) => ({ name: f.label, count: f.count }))
        : buildFilterOptions((bootstrap?.products ?? []).map((p) => p.category_name)),
    [bootstrap?.product_filters?.categories, bootstrap?.products],
  );
  const allBrandNames = useMemo(() => brandOptions.map((option) => option.name), [brandOptions]);
  const allCategoryNames = useMemo(() => categoryOptions.map((option) => option.name), [categoryOptions]);

  const [name, setName] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<string[]>([]);
  const [buyerSheetOpen, setBuyerSheetOpen] = useState(false);
  const [validFrom, setValidFrom] = useState(isoDateInput(new Date()));
  const [validTo, setValidTo] = useState('');
  const [priceSource, setPriceSource] = useState<CatalogComposerPriceSource>('manual');
  const [priceListId, setPriceListId] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('edit_each');
  const [pricingValue, setPricingValue] = useState('');
  const [campaignPrices, setCampaignPrices] = useState<Record<string, number | null>>({});
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availability, setAvailability] = useState<CatalogComposerAvailability>('show_everything');
  const [selectedLastOrderBucket, setSelectedLastOrderBucket] = useState<string>('');
  const [selectedGmv90dBucket, setSelectedGmv90dBucket] = useState<string>('');
  const [isDynamic, setIsDynamic] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialSelectionIds, setInitialSelectionIds] = useState<Set<string>>(new Set());
  const [tagOverrides, setTagOverrides] = useState<Record<string, CatalogComposerTag | null>>({});
  const [initialTagOverrides, setInitialTagOverrides] = useState<Record<string, CatalogComposerTag | null>>({});
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [didInit, setDidInit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CatalogComposerFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | 'draft'>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDialogMode, setPublishDialogMode] = useState<PublishCampaignDialogMode>('first_publish');
  const [notifyWhatsappPreview, setNotifyWhatsappPreview] = useState(true);

  const productsQuery = useCatalogComposerProducts({
    query: search,
    brands: selectedBrands,
    categories: selectedCategories,
    availability,
    limit: 50,
    enabled: !bootstrapLoading,
  });
  const productPages = productsQuery.data?.pages ?? [];
  const products = useMemo(
    () => productPages.flatMap((page) => page.products ?? []),
    [productPages],
  );
  const productCount = productPages[0]?.total ?? bootstrap?.product_count ?? products.length;
  const isLoading = bootstrapLoading || productsQuery.isLoading || (mode === 'edit' && detailLoading);
  const isError = bootstrapError || productsQuery.isError || (mode === 'edit' && detailError);

  useEffect(() => {
    if (didInit) return;
    if (mode === 'edit') {
      if (!detailComposer) return;

      const nextBrands = detailComposer.filters.brand_names;
      const nextCategories = detailComposer.filters.category_names;
      const nextSelectedIds = new Set(detailComposer.items.map((item) => item.tenant_product_id));

      setName(detailComposer.name);
      setCohortId(
        detailComposer.scope_type === 'all'
          ? ALL_BUYERS_SCOPE_VALUE
          : detailComposer.scope_type === 'buyer'
            ? SELECT_BUYERS_SCOPE_VALUE
            : (detailComposer.cohort_id ?? ''),
      );
      setSelectedBuyerIds(detailComposer.buyer_ids ?? []);
      setValidFrom(detailComposer.valid_from.slice(0, 10));
      setValidTo(detailComposer.valid_to ? detailComposer.valid_to.slice(0, 10) : '');
      setPriceSource(detailComposer.price_source ?? 'manual');
      setPriceListId(detailComposer.price_list_id ?? null);
      setPricingMode(detailComposer.pricing_strategy?.mode ?? 'edit_each');
      setPricingValue(detailComposer.pricing_strategy?.value ?? '');
      setCampaignPrices(Object.fromEntries(detailComposer.items.map((item) => [item.tenant_product_id, item.price_override ?? null])));
      setSelectedBrands(nextBrands);
      setSelectedCategories(nextCategories);
      setAvailability(detailComposer.filters.availability);
      setSelectedLastOrderBucket(detailComposer.filters.last_ordered_bucket ?? '');
      setSelectedGmv90dBucket(detailComposer.filters.gmv_90d_bucket ?? '');
      setIsDynamic(detailComposer.is_dynamic ?? false);
      setSelectedIds(nextSelectedIds);
      setTagOverrides(detailComposer.tag_overrides ?? {});
      setInitialTagOverrides(detailComposer.tag_overrides ?? {});
      setInitialSelectionIds(new Set(nextSelectedIds));
      setDidInit(true);
      return;
    }

    if (products.length === 0) return;

    const nextSelectedIds = new Set(products.map((product) => product.id));
    setName('');
    setCohortId(cohorts[0]?.id ?? ALL_BUYERS_SCOPE_VALUE);
    setSelectedBuyerIds([]);
    setValidFrom(isoDateInput(new Date()));
    setValidTo('');
    setPriceSource('manual');
    setPriceListId(null);
    setPricingMode('edit_each');
    setPricingValue('');
    setCampaignPrices({});
    setSelectedBrands([]);
    setSelectedCategories([]);
    setAvailability('show_everything');
    setSelectedLastOrderBucket('');
    setSelectedGmv90dBucket('');
    setIsDynamic(false);
    setSelectedIds(nextSelectedIds);
    setTagOverrides({});
    setInitialTagOverrides({});
    setInitialSelectionIds(new Set(nextSelectedIds));
    setDidInit(true);
  }, [allBrandNames, allCategoryNames, cohorts, detailComposer, didInit, mode, products]);

  const effectiveTag = (product: CatalogComposerProduct) => tagOverrides[product.id] ?? product.tag;

  const filteredProducts = useMemo(() => {
    const lowered = search.trim().toLowerCase();

    return products.filter((product) => {
      const brandName = normalizeFilterLabel(product.brand_name);
      const categoryName = normalizeFilterLabel(product.category_name);
      const matchesBrand = selectedBrands.length === 0 || selectedBrands.includes(brandName);
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(categoryName);
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
  }, [availability, products, search, selectedBrands, selectedCategories, tagOverrides]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.has(product.id)),
    [products, selectedIds],
  );

  const priceListPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!priceListId) return map;
    for (const item of priceListItems) {
      if (item.price_list_id === priceListId) map.set(item.tenant_product_id, item.price);
    }
    return map;
  }, [priceListId, priceListItems]);

  function basePrice(product: CatalogComposerProduct) {
    return Number(product.base_selling_price ?? product.mrp ?? 0);
  }

  function resolvedCampaignPrice(product: CatalogComposerProduct) {
    if (priceSource === 'price_list') {
      return priceListPriceMap.get(product.id) ?? basePrice(product);
    }
    return campaignPrices[product.id] ?? basePrice(product);
  }

  function discountPct(product: CatalogComposerProduct) {
    const base = basePrice(product);
    if (base <= 0) return null;
    return ((base - resolvedCampaignPrice(product)) / base) * 100;
  }

  function marginPct(product: CatalogComposerProduct) {
    const price = resolvedCampaignPrice(product);
    const cost = product.cost_price;
    if (price <= 0 || cost == null) return null;
    return ((price - Number(cost)) / price) * 100;
  }

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
  const isSelectedBuyersScope = cohortId === SELECT_BUYERS_SCOPE_VALUE;
  const selectedAudienceName = isAllBuyersScope ? 'All Buyers' : isSelectedBuyersScope ? 'Selected buyers' : (selectedCohort?.name ?? 'Choose a customer group');
  const selectedAudienceCount = isAllBuyersScope ? buyerCount : isSelectedBuyersScope ? selectedBuyerIds.length : (selectedCohort?.member_count ?? 0);
  const overriddenTagCount = Object.values(tagOverrides).filter((value) => value != null).length;
  const priceOverrideCount = filteredSelectedProducts.filter((product) => resolvedCampaignPrice(product) !== basePrice(product)).length;
  const avgDiscountPct = filteredSelectedProducts.length > 0
    ? filteredSelectedProducts.reduce((sum, product) => sum + Math.max(0, discountPct(product) ?? 0), 0) / filteredSelectedProducts.length
    : 0;
  const pendingPublishSummary = [
    { label: 'Name', value: name || 'Untitled campaign' },
    { label: 'Audience', value: `${selectedAudienceName} (${selectedAudienceCount} buyers)` },
    { label: 'Products', value: `${selectedVisibleCount} selected · ${selectedBrandCount} brands` },
    { label: 'Validity', value: validFrom ? `${formatDate(validFrom)} → ${validTo ? formatDate(validTo) : 'Open ended'}` : '—' },
  ];

  const isPublishedEdit = mode === 'edit' && detail?.composer?.live_status !== 'draft';
  const composerScopeType = isAllBuyersScope ? 'all' : isSelectedBuyersScope ? 'buyer' : 'cohort';
  const selectedPriceListName = priceLists.find((list) => list.id === priceListId)?.name ?? null;

  const publishUpdatesPreview = useMemo<CatalogPublishPreviewResponse | undefined>(() => {
    if (!publishDialogOpen || publishDialogMode !== 'publish_updates') return undefined;
    return {
      campaign: {
        id: catalogId ?? null,
        name: name.trim() || 'Untitled campaign',
        valid_from: validFrom ? `${validFrom}T00:00:00.000Z` : new Date().toISOString(),
        valid_to: validTo ? `${validTo}T23:59:59.000Z` : null,
        audience_label: `${selectedAudienceName} (${selectedAudienceCount} buyers)`,
        products_count: filteredSelectedProducts.length,
        pricing_scheme: priceSource === 'price_list'
          ? `Price list — ${selectedPriceListName ?? 'Assigned list'}`
          : 'Manual campaign prices',
        buyer_note: detailComposer?.message ?? '',
        hero_image_url: null,
        header_image_url: '',
        header_image_source: 'platform_default',
      },
      whatsapp: {
        feature_enabled: false,
        notify_available: false,
        can_notify: false,
        blockers: [],
        recipient_count: 0,
        credits_per_message: 0,
        estimated_credits: 0,
        estimated_inr: 0,
        credits_balance: 0,
        credit_price_inr: 0,
        template_approved: false,
        tenant_phone_configured: false,
        broadcast_sending_paused: false,
        quality_rating_blocked: false,
      },
      template: {
        seller_name: 'Your business',
        seller_phone_display: 'Your business number',
        footer_text: 'Powered by Yukti',
        buttons: [
          { label: 'View campaign', type: 'url' },
          { label: 'Enquire now', type: 'url' },
          { label: 'Unsubscribe', type: 'quick_reply' },
        ],
      },
    };
  }, [
    publishDialogOpen,
    publishDialogMode,
    catalogId,
    name,
    validFrom,
    validTo,
    selectedAudienceName,
    selectedAudienceCount,
    filteredSelectedProducts.length,
    priceSource,
    selectedPriceListName,
    detailComposer?.message,
  ]);

  const firstPublishPreview = useComposerPublishPreview({
    enabled: publishDialogOpen && publishDialogMode === 'first_publish',
    notifyWhatsapp: notifyWhatsappPreview,
    scopeType: composerScopeType,
    cohortId: isAllBuyersScope || isSelectedBuyersScope ? null : cohortId,
    buyerIds: selectedBuyerIds,
    name: name.trim() || 'Untitled campaign',
    validFrom,
    validTo,
    productsCount: filteredSelectedProducts.length,
    priceSource,
    priceListName: selectedPriceListName,
    campaignId: mode === 'edit' ? catalogId : undefined,
  });

  const activePublishPreview = publishDialogMode === 'publish_updates'
    ? publishUpdatesPreview
    : firstPublishPreview.data;
  const activePublishPreviewLoading = publishDialogMode === 'publish_updates'
    ? false
    : firstPublishPreview.isLoading;
  const activePublishPreviewError = publishDialogMode === 'publish_updates'
    ? null
    : (firstPublishPreview.error instanceof Error ? firstPublishPreview.error.message : null);

  const serializedState = useMemo(
    () => JSON.stringify({
      name,
      cohortId,
      selectedBuyerIds: [...selectedBuyerIds].sort(),
      validFrom,
      validTo,
      priceSource,
      priceListId,
      campaignPrices,
      selectedBrands,
      selectedCategories,
      availability,
      selectedLastOrderBucket,
      selectedGmv90dBucket,
      isDynamic,
      selectedIds: Array.from(selectedIds).sort(),
      tagOverrides,
    }),
    [availability, campaignPrices, cohortId, isDynamic, name, priceListId, priceSource, selectedBrands, selectedBuyerIds, selectedCategories, selectedGmv90dBucket, selectedIds, selectedLastOrderBucket, tagOverrides, validFrom, validTo],
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

  const closeTarget = mode === 'edit' && catalogId ? `/campaigns/${catalogId}` : '/campaigns';
  const dirtyGuard = useDirtyCloseGuard({
    isDirty,
    onConfirmClose: () => router.push(closeTarget),
  });

  function toggleMany(current: string[], allValues: string[], setter: (values: string[]) => void) {
    setter(current.length > 0 ? [] : allValues);
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

  function applyPricingToProducts(ids: string[], mode: PricingMode, rawValue: string) {
    const value = Number(rawValue);
    if ((mode === 'percent_off_base' || mode === 'flat_off_base') && (!Number.isFinite(value) || value < 0)) return;
    setCampaignPrices((current) => {
      const next = { ...current };
      for (const id of ids) {
        const product = products.find((item) => item.id === id);
        if (!product) continue;
        const base = basePrice(product);
        if (mode === 'edit_each') {
          if (!(id in next)) next[id] = base;
        } else if (mode === 'percent_off_base') {
          next[id] = Math.max(0, Math.round(base * (1 - value / 100) * 100) / 100);
        } else {
          next[id] = Math.max(0, Math.round((base - value) * 100) / 100);
        }
      }
      return next;
    });
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

  async function fetchAllMatchingProductsForSave() {
    const allProducts: CatalogComposerProduct[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 100; guard += 1) {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('availability', availability);
      if (search.trim()) params.set('q', search.trim());
      selectedBrands.forEach((brand) => params.append('brand', brand));
      selectedCategories.forEach((category) => params.append('category', category));
      if (cursor) params.set('cursor', cursor);

      const res = await apiFetch(`/api/tenant/catalogs/composer/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to resolve all matching products');
      const data = (await res.json()) as { products?: CatalogComposerProduct[]; nextCursor?: string | null };
      allProducts.push(...(data.products ?? []));
      cursor = data.nextCursor ?? null;
      if (!cursor) break;
    }
    return allProducts;
  }

  function buildSavePayload(
    saveMode: 'draft' | 'publish',
    publishOptions?: {
      buyerNote: string;
      notifyWhatsapp: boolean;
      notifyScheduledFor: string | null;
      heroImageUrl: string | null;
    },
  ) {
    return {
      name: name.trim(),
      scope_type: isAllBuyersScope ? 'all' : isSelectedBuyersScope ? 'buyer' : 'cohort',
      cohort_id: isAllBuyersScope || isSelectedBuyersScope ? null : cohortId || null,
      buyer_ids: isSelectedBuyersScope ? selectedBuyerIds : [],
      valid_from: validFrom ? `${validFrom}T00:00:00` : '',
      valid_to: validTo ? `${validTo}T23:59:59` : undefined,
      price_source: priceSource,
      price_list_id: priceSource === 'price_list' ? priceListId : null,
      pricing_strategy: priceSource === 'manual'
        ? { mode: pricingMode, value: pricingValue.trim() }
        : undefined,
      is_dynamic: isDynamic,
      filters: {
        brand_names: selectedBrands,
        category_names: selectedCategories,
        availability,
        last_ordered_bucket: selectedLastOrderBucket || undefined,
        gmv_90d_bucket: selectedGmv90dBucket || undefined,
      },
      tag_overrides: tagOverrides,
      items: filteredSelectedProducts.map((product, index) => ({
        tenant_product_id: product.id,
        display_order: index,
        price_override: resolvedCampaignPrice(product),
      })),
      save_mode: saveMode,
      ...(saveMode === 'publish' && publishOptions
        ? {
            buyer_note: publishOptions.buyerNote,
            notify_whatsapp: publishOptions.notifyWhatsapp,
            notify_scheduled_for: publishOptions.notifyScheduledFor ?? undefined,
            hero_image_url: publishOptions.heroImageUrl ?? undefined,
          }
        : {}),
    };
  }

  function validateBeforeSave(
    saveMode: 'draft' | 'publish',
    publishOptions?: {
      buyerNote: string;
      notifyWhatsapp: boolean;
      notifyScheduledFor: string | null;
      heroImageUrl: string | null;
    },
  ) {
    const payload = buildSavePayload(saveMode, publishOptions);
    const nextErrors: CatalogComposerFieldErrors = {};
    const parsed = CatalogComposerPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? '');
        if (path === 'name') nextErrors.name = issue.message;
        else if (path === 'cohort_id') nextErrors.cohortId = issue.message;
        else if (path === 'buyer_ids') nextErrors.buyers = issue.message;
        else if (path === 'price_list_id') nextErrors.priceListId = issue.message;
        else if (path === 'valid_from') nextErrors.validFrom = issue.message;
        else if (path === 'valid_to') nextErrors.validTo = issue.message;
      }
    }

    if (payload.items.length === 0) {
      nextErrors.products = 'Select at least one product to save this campaign.';
    }

    setFieldErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, payload: parsed.success ? parsed.data : null };
  }

  async function handleSave(
    saveMode: 'draft' | 'publish',
    publishOptions?: {
      buyerNote: string;
      notifyWhatsapp: boolean;
      notifyScheduledFor: string | null;
      heroImageUrl: string | null;
    },
  ) {
    setSubmitError(null);
    const { isValid, payload } = validateBeforeSave(saveMode, publishOptions);
    if (!isValid || !payload) return;

    let finalPayload = payload;
    const needsFullProductResolution =
      productCount > products.length ||
      search.trim().length > 0 ||
      selectedBrands.length > 0 ||
      selectedCategories.length > 0 ||
      availability !== 'show_everything';
    if (needsFullProductResolution) {
      try {
        const allMatchingProducts = await fetchAllMatchingProductsForSave();
        const visibleDeselectedIds = new Set(products.filter((product) => !selectedIds.has(product.id)).map((product) => product.id));
        const selectedMatchingProducts = allMatchingProducts.filter((product) => !visibleDeselectedIds.has(product.id));
        let displayOrder = 0;
        const resolvedItems = selectedMatchingProducts.map((product) => ({
          tenant_product_id: product.id,
          display_order: displayOrder++,
          price_override: resolvedCampaignPrice(product),
        }));
        if (resolvedItems.length > 0) {
          finalPayload = { ...payload, items: resolvedItems };
        }
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Failed to resolve matching products');
        return;
      }
    }

    try {
      const result = await saveMutation.mutateAsync(finalPayload);
      setPublishDialogOpen(false);
      if (saveMode === 'publish') {
        if (publishDialogMode === 'publish_updates') {
          toast.success('Campaign updates published.');
        } else {
          const notifySuffix = result.whatsapp_notify
            ? result.whatsapp_notify.scheduled
              ? ` WhatsApp notify scheduled for ${result.whatsapp_notify.recipient_count} buyers.`
              : ` WhatsApp notify queued for ${result.whatsapp_notify.recipient_count} buyers.`
            : '';
          toast.success(`Campaign published.${notifySuffix}`);
        }
      }
      router.push(`/campaigns/${result.catalog.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save campaign');
    }
  }

  if (isError || (mode === 'edit' && detail && !detail.composer)) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 py-6">
        <div className="rounded-[18px] border border-danger-200 bg-danger-50 p-5 text-base text-danger-700">
          We couldn&apos;t load this campaign composer right now.
        </div>
      </div>
    );
  }

  if (isLoading || !didInit) {
    return <SharedCatalogComposerSkeleton />;
  }

  const createSubtitle = 'Curate which products a customer group sees. The campaign controls visibility, availability, and what gets marked new.';
  const editSubtitle = isPublishedEdit
    ? 'You are staging edits for a live campaign. Save keeps current buyer assignments unchanged until you publish updates.'
    : 'You are editing a draft campaign. Update the customer group assortment, then review the summary before publishing.';

  function openPublishDialog(mode: PublishCampaignDialogMode) {
    const { isValid } = validateBeforeSave('publish');
    if (!isValid) return;
    setPublishDialogMode(mode);
    setNotifyWhatsappPreview(true);
    setPublishDialogOpen(true);
  }

  async function handlePublishFromDialog(input: {
    notifyWhatsapp: boolean;
    buyerNote: string;
    notifyScheduledFor: string | null;
    heroImageUrl: string | null;
  }) {
    await handleSave('publish', input);
  }

  async function handleActionClick(action: 'draft' | 'publish') {
    if (action === 'publish') {
      openPublishDialog(isPublishedEdit ? 'publish_updates' : 'first_publish');
      return;
    }
    if (isPublishedEdit) {
      setConfirmAction('draft');
      return;
    }
    await handleSave('draft');
  }

  return (
    <>
      <PageWrap className={cn('flex flex-col', composerPageMinHeightClass, 'pt-7 pb-6')}>
        <ComposerShell>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
          <ComposerBreadcrumbs
            items={[
              { label: 'Campaigns', href: '/campaigns' },
              { label: mode === 'edit' ? detail?.header.name ?? 'Edit campaign' : 'New campaign', current: true },
            ]}
          />

          <ComposerTitleRow
            title={mode === 'edit' ? 'Edit campaign' : 'Add a campaign'}
            subtitle={mode === 'edit' ? editSubtitle : createSubtitle}
            status={{
              label: mode === 'edit'
                ? detail?.composer?.status === 'published_dirty'
                  ? 'Live · Unpublished Changes'
                  : detail?.composer?.status === 'scheduled'
                    ? 'Scheduled'
                    : detail?.composer?.status === 'expired'
                      ? 'Expired'
                      : detail?.composer?.status === 'archived'
                        ? 'Archived'
                        : detail?.composer?.status === 'published'
                          ? 'Live'
                          : 'Draft'
                : 'Draft',
              tone: mode === 'edit' && detail?.composer?.status !== 'draft' ? 'live' : 'draft',
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

          <ComposerBasicsStrip columnsClassName="lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
            <ComposerBasicsField label="Campaign Name">
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  clearFieldError('name');
                  setSubmitError(null);
                }}
                placeholder="e.g. Summer ’26 · New Arrivals"
                error={fieldErrors.name}
                className="h-auto border-0 bg-transparent px-0 py-0 font-medium text-base text-cream-950 shadow-none focus-visible:ring-0"
              />
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
              {fieldErrors.validTo ? <p className="mt-1 text-sm text-danger-500">{fieldErrors.validTo}</p> : null}
            </ComposerBasicsField>

            <ComposerBasicsField label="Customer group">
              <Select
                value={cohortId}
                onValueChange={(value) => {
                  setCohortId(value);
                  if (value === SELECT_BUYERS_SCOPE_VALUE) setBuyerSheetOpen(true);
                  clearFieldError('cohortId');
                  clearFieldError('buyers');
                  setSubmitError(null);
                }}
              >
                <SelectTrigger
                  error={fieldErrors.cohortId}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-base font-medium text-cream-950 shadow-none focus:ring-0"
                >
                  {cohortId ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                      <div className="min-w-0 truncate">{selectedAudienceName}</div>
                      <BuyerCountPill count={selectedAudienceCount} />
                    </div>
                  ) : (
                    <SelectValue placeholder="Pick a customer group" />
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
                  <SelectItem value={SELECT_BUYERS_SCOPE_VALUE} className="py-2.5">
                    <div className="flex min-w-0 items-center justify-between gap-4 pr-6">
                      <div className="min-w-0 truncate font-medium">Select buyers for campaign</div>
                      <BuyerCountPill count={selectedBuyerIds.length} />
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {fieldErrors.buyers ? <p className="mt-1 text-sm text-danger-500">{fieldErrors.buyers}</p> : null}
            </ComposerBasicsField>

            <ComposerBasicsField label="Pricelist">
              <Select
                value={priceSource === 'manual' ? SETUP_CAMPAIGN_PRICES_VALUE : (priceListId ?? '')}
                onValueChange={(value) => {
                  if (value === SETUP_CAMPAIGN_PRICES_VALUE) {
                    setPriceSource('manual');
                    setPriceListId(null);
                  } else {
                    setPriceSource('price_list');
                    setPriceListId(value);
                  }
                  clearFieldError('priceListId');
                  setSubmitError(null);
                }}
              >
                <SelectTrigger
                  error={fieldErrors.priceListId}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-base font-medium text-cream-950 shadow-none focus:ring-0"
                >
                  <SelectValue placeholder="Select pricelist" />
                </SelectTrigger>
                <SelectContent>
                  {priceLists.map((priceList) => (
                    <SelectItem key={priceList.id} value={priceList.id}>
                      <div className="flex min-w-0 items-center justify-between gap-3 pr-6">
                        <span className="min-w-0 truncate font-medium">{priceList.name}</span>
                        <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.06em]', priceListStatusPillClasses(priceList.status))}>
                          {priceList.status === 'active' ? 'Active' : 'Draft'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value={SETUP_CAMPAIGN_PRICES_VALUE}>Setup campaign prices</SelectItem>
                </SelectContent>
              </Select>
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
              <AlertTitle>Couldn&apos;t save campaign</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}

          {isPublishedEdit ? (
            <Alert variant="warning">
              <AlertTitle>Editing a live campaign</AlertTitle>
              <AlertDescription>
                Save changes keeps the current buyer-facing campaign untouched. Publish updates pushes this staged version to the mapped customer group or buyers.
              </AlertDescription>
            </Alert>
          ) : null}

          <ComposerBodyGrid
            left={
              <ComposerSidebarCard>
                <div className="space-y-5">
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Brand</h3>
                      <button
                        type="button"
                        className="text-sm font-medium text-teal-700 hover:text-teal-800"
                        onClick={() => toggleMany(selectedBrands, allBrandNames, setSelectedBrands)}
                      >
                        {selectedBrands.length > 0 ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {brandOptions.map((brand) => (
                        <label key={brand.name} className="flex items-center justify-between gap-3 text-base text-cream-900">
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
                          <span className="font-mono text-xs text-cream-700">{brand.count}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Product Category</h3>
                      <button
                        type="button"
                        className="text-sm font-medium text-teal-700 hover:text-teal-800"
                        onClick={() => toggleMany(selectedCategories, allCategoryNames, setSelectedCategories)}
                      >
                        {selectedCategories.length > 0 ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {categoryOptions.map((category) => (
                        <label key={category.name} className="flex items-center justify-between gap-3 text-base text-cream-900">
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
                          <span className="font-mono text-xs text-cream-700">{category.count}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Availability</h3>
                    <div className="space-y-2">
                      {AVAILABILITY_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-base text-cream-900">
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

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Order history</h3>
                    <Select
                      value={selectedLastOrderBucket || 'any'}
                      onValueChange={(v) => setSelectedLastOrderBucket(v === 'any' ? '' : v)}
                    >
                      <SelectTrigger className="w-full bg-cream-50 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any time</SelectItem>
                        <SelectItem value="within_30_days">Last 30 days</SelectItem>
                        <SelectItem value="within_90_days">Last 90 days</SelectItem>
                        <SelectItem value="dormant_90_plus_days">Dormant (90+ days)</SelectItem>
                        <SelectItem value="anytime">Ever ordered</SelectItem>
                      </SelectContent>
                    </Select>
                  </section>

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">GMV · last 90 days</h3>
                    <Select
                      value={selectedGmv90dBucket || 'any'}
                      onValueChange={(v) => setSelectedGmv90dBucket(v === 'any' ? '' : v)}
                    >
                      <SelectTrigger className="w-full bg-cream-50 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any amount</SelectItem>
                        <SelectItem value="gmv_0">No revenue</SelectItem>
                        <SelectItem value="gmv_1_50000">₹1 – ₹50K</SelectItem>
                        <SelectItem value="gmv_50001_200000">₹50K – ₹2L</SelectItem>
                        <SelectItem value="gmv_200001_500000">₹2L – ₹5L</SelectItem>
                        <SelectItem value="gmv_500001_plus">₹5L+</SelectItem>
                      </SelectContent>
                    </Select>
                  </section>

                  <section className="border-t border-cream-200 pt-4">
                    <label className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-cream-900">Keep products dynamic</p>
                        <p className="text-xs text-cream-500 mt-0.5">Auto-update product list as inventory changes</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isDynamic}
                        onClick={() => setIsDynamic((v) => !v)}
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                          isDynamic ? 'bg-teal-600' : 'bg-cream-300',
                        )}
                      >
                        <span
                          className={cn(
                            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                            isDynamic ? 'translate-x-4' : 'translate-x-0',
                          )}
                        />
                      </button>
                    </label>
                  </section>
                </div>
              </ComposerSidebarCard>
            }
            center={
              <ComposerMainCard>
                <div className="flex flex-wrap items-center gap-3 border-b border-cream-300 bg-cream-50 px-4 py-3">
                  <div>
                    <div className="text-base font-semibold text-cream-900">
                      {filteredProducts.length} of {productCount} products match
                    </div>
                    <div className="text-sm text-cream-700">
                      Select products and setup campaign pricing.
                    </div>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="flex min-w-[240px] items-center gap-2 rounded-[8px] border border-cream-300 bg-white px-3 py-2 text-base text-cream-700">
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
                          Bulk tags
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 border-cream-300 bg-white p-2">
                        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">
                          Apply to {selectedProducts.length} selected rows
                        </div>
                        <div className="space-y-1">
                          {TAG_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className="flex w-full items-center justify-between rounded-[8px] px-2 py-2 text-left text-base text-cream-900 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                    Reset tags
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

                {priceSource === 'manual' ? (
                  <div className="flex flex-wrap items-center gap-3 border-b border-cream-300 bg-white px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-cream-800">
                      Campaign pricing
                    </div>
                    <Select value={pricingMode} onValueChange={(value) => setPricingMode(value as PricingMode)}>
                      <SelectTrigger className="h-9 w-[220px] border-cream-300 bg-white text-sm font-medium text-cream-900">
                        <SelectValue placeholder="Pricing mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="edit_each">Edit each price</SelectItem>
                        <SelectItem value="percent_off_base">% off base price</SelectItem>
                        <SelectItem value="flat_off_base">Flat discount off base price</SelectItem>
                      </SelectContent>
                    </Select>
                    {pricingMode !== 'edit_each' ? (
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-cream-700">
                          {pricingMode === 'percent_off_base' ? '%' : '₹'}
                        </span>
                        <Input
                          value={pricingValue}
                          onChange={(event) => {
                            const next = pricingMode === 'percent_off_base'
                              ? event.target.value.replace(/[^\d.]/g, '')
                              : formatNumberInput(event.target.value, 'CURRENCY_EXACT');
                            setPricingValue(next);
                          }}
                          placeholder={pricingMode === 'percent_off_base' ? 'Discount' : 'Flat amount'}
                          className="h-9 pl-7 pr-3 text-right font-mono"
                          inputMode="decimal"
                        />
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => applyPricingToProducts(Array.from(selectedIds), pricingMode, pricingValue)}
                      disabled={selectedIds.size === 0 || (pricingMode !== 'edit_each' && !pricingValue.trim())}
                    >
                      Apply to selected
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => applyPricingToProducts(filteredProducts.map((product) => product.id), pricingMode, pricingValue)}
                      disabled={filteredProducts.length === 0 || (pricingMode !== 'edit_each' && !pricingValue.trim())}
                    >
                      Apply to filtered
                    </Button>
                  </div>
                ) : (
                  <div className="border-b border-cream-300 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                    Campaign prices are populated from {priceLists.find((priceList) => priceList.id === priceListId)?.name ?? 'selected pricelist'}; products without a pricelist item use base selling price.
                  </div>
                )}

                {filteredProducts.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center px-8 py-16 text-base text-cream-700">
                    No products match the current filters and search.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full border-collapse text-base">
                      <thead className="sticky top-0 z-[1] bg-cream-50">
                        <tr>
                          <th className="w-9 border-b border-cream-300 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">
                            <input
                              type="checkbox"
                              checked={filteredProducts.length > 0 && selectedVisibleCount === filteredProducts.length}
                              onChange={(event) => toggleVisibleSelection(event.target.checked)}
                              className="accent-teal-500"
                            />
                          </th>
                          <th className="min-w-[300px] border-b border-cream-300 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Product</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Cost price</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Base selling price</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Campaign price</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Discount</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Margin</th>
                          <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Tag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((product, index) => {
                          const isSelected = selectedIds.has(product.id);
                          const currentTag = effectiveTag(product);
                          const tag = tagLabel(currentTag);
                          const base = basePrice(product);
                          const campaignPrice = resolvedCampaignPrice(product);
                          const discount = discountPct(product);
                          const margin = marginPct(product);
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
                                    <p className="truncate text-base font-medium text-cream-900">{product.display_name}</p>
                                    <p className="mt-0.5 truncate text-xs text-cream-700">
                                      <span className="font-mono">{product.internal_sku}</span>
                                      {' · '}
                                      {product.brand_name}
                                      {' · '}
                                      <span className={stockTextClasses(product.stock_tone)}>Stock {product.stock_label}</span>
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{product.cost_price != null ? formatNumberValue(product.cost_price, 'CURRENCY_EXACT') : '—'}</td>
                              <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{base > 0 ? formatNumberValue(base, 'CURRENCY_EXACT') : '—'}</td>
                              <td className="px-4 py-3 text-right">
                                {priceSource === 'manual' ? (
                                  <div className="ml-auto flex w-[140px] items-center rounded-[8px] border border-cream-300 bg-white px-3 py-2">
                                    <span className="shrink-0 font-mono text-sm text-cream-600">₹</span>
                                    <Input
                                      value={campaignPrice == null ? '' : formatNumberInput(String(campaignPrice), 'CURRENCY_EXACT')}
                                      onChange={(event) => {
                                        const next = parseNumberInput(formatNumberInput(event.target.value, 'CURRENCY_EXACT'), 'CURRENCY_EXACT');
                                        setCampaignPrices((current) => ({
                                          ...current,
                                          [product.id]: next,
                                        }));
                                      }}
                                      className="h-auto border-0 bg-transparent p-0 text-right font-mono text-sm shadow-none focus-visible:ring-0"
                                      data-row-click-ignore="true"
                                    />
                                  </div>
                                ) : (
                                  <span className="font-mono font-semibold text-cream-900">{formatNumberValue(campaignPrice, 'CURRENCY_EXACT')}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-cream-900">
                                {discount == null ? '—' : `${formatNumberValue(Math.max(0, discount), 'PERCENTAGE')}`}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-cream-900">
                                {margin == null ? '—' : `${formatNumberValue(margin, 'PERCENTAGE')}`}
                              </td>
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
                                        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]', tagPillClasses(currentTag))}>
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
                    {productsQuery.hasNextPage ? (
                      <div className="border-t border-cream-300 bg-white px-4 py-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void productsQuery.fetchNextPage()}
                          disabled={productsQuery.isFetchingNextPage}
                        >
                          {productsQuery.isFetchingNextPage ? 'Loading…' : 'Load more products'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </ComposerMainCard>
            }
            right={
              <ComposerSidebarCard>
                <div className="flex h-full flex-col gap-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Campaign summary</h3>
                    <div className="mt-4">
                      <p className="font-display text-lg font-medium tracking-[-0.005em] text-cream-900">
                        {name || 'Untitled campaign'}
                      </p>
                      <p className="mt-1 text-sm text-cream-700">
                        Publishes to {selectedAudienceName} ({selectedAudienceCount} buyers)
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-cream-300" />

                  <div className="space-y-3">
                    <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-sm leading-[1.5] text-cream-700">
                      <div className="font-medium text-cream-900">{selectedAudienceName}</div>
                      <div className="mt-1">
                        will see: {selectedVisibleCount} products across {selectedBrandCount} brands.
                      </div>
                      {hiddenSelectedCount > 0 ? <div className="mt-1">{hiddenSelectedCount} products are outside the current filters.</div> : null}
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Products</span>
                      <span className="font-mono font-medium text-cream-900">{selectedVisibleCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Brands</span>
                      <span className="font-mono font-medium text-cream-900">{selectedBrandCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">In stock</span>
                      <span className="font-mono font-medium text-cream-900">{inStockCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">New</span>
                      <span className="font-mono font-medium text-cream-900">{newCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">New Stock</span>
                      <span className="font-mono font-medium text-cream-900">{newStockCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Old Stock</span>
                      <span className="font-mono font-medium text-cream-900">{oldStockCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Manual tag overrides</span>
                      <span className="font-mono font-medium text-cream-900">{overriddenTagCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Price overrides</span>
                      <span className="font-mono font-medium text-cream-900">{priceOverrideCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Avg. discount</span>
                      <span className="font-mono font-medium text-cream-900">{formatNumberValue(avgDiscountPct, 'PERCENTAGE')}</span>
                    </div>
                  </div>

                  <div className="h-px bg-cream-300" />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Reach</span>
                      <span className="font-mono font-medium text-cream-900">{selectedAudienceCount} buyers</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Valid from</span>
                      <span className="font-mono font-medium text-cream-900">{validFrom ? formatDate(validFrom) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-cream-700">Valid until</span>
                      <span className="font-mono font-medium text-cream-900">{validTo ? formatDate(validTo) : 'Open ended'}</span>
                    </div>
                  </div>

                  <div className="h-px bg-cream-300" />

                  {isPublishedEdit ? (
                    <>
                      <div className="h-px bg-cream-300" />
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Next publish</h4>
                        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3">
                          <div className="space-y-2 text-sm leading-[1.5] text-amber-900">
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
                    'mt-auto rounded-[10px] px-3 py-3 text-sm leading-[1.5]',
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
                          ? 'Save keeps these edits staged privately. Publish updates is the moment mapped buyers or customer groups see the new campaign.'
                          : 'Ready to publish. Buyers see this campaign as soon as it goes live.'}
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
              <div className={cn('inline-flex items-center gap-2 text-sm', isDirty ? 'text-ember-700' : 'text-cream-700')}>
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
                  variant="primary"
                  onClick={() => void handleActionClick('draft')}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {isPublishedEdit ? 'Save changes' : 'Save as draft'}
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => void handleActionClick('publish')}
                  disabled={saveMutation.isPending}
                >
                  <Send className="h-3.5 w-3.5" />
                  {mode === 'edit' ? 'Publish updates' : 'Publish campaign'}
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

      <SellerBuyerPickerOverlay
        open={buyerSheetOpen}
        onOpenChange={setBuyerSheetOpen}
        title="Select buyers for campaign"
        selectedBuyerIds={selectedBuyerIds}
        onSelectedBuyerIdsChange={(ids) => {
          setSelectedBuyerIds(ids);
          clearFieldError('buyers');
        }}
        onApply={() => {
          setCohortId(SELECT_BUYERS_SCOPE_VALUE);
          clearFieldError('buyers');
        }}
      />

      <Dialog open={confirmAction !== null} onOpenChange={(open) => setConfirmAction(open ? confirmAction : null)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Save unpublished changes?</DialogTitle>
            <DialogDescription>
              This stores your edits as a private draft. Mapped buyers and customer groups will keep seeing the current live campaign until you publish updates.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-4 text-base leading-6 text-cream-700">
            You can come back later, review these staged changes, and publish when ready.
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                await handleSave('draft');
                setConfirmAction(null);
              }}
              disabled={saveMutation.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PublishCampaignDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        mode={publishDialogMode}
        preview={activePublishPreview}
        previewLoading={activePublishPreviewLoading}
        previewError={activePublishPreviewError}
        isPublishing={saveMutation.isPending}
        onNotifyWhatsappChange={setNotifyWhatsappPreview}
        onPublish={handlePublishFromDialog}
      />
    </>
  );
}
