'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, RotateCcw, Save, Search, TriangleAlert, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EntityAvatar, PageWrap } from '@/components/seller/layout';
import {
  ComposerBasicsField,
  ComposerBasicsStrip,
  ComposerBodyGrid,
  ComposerBreadcrumbs,
  ComposerCheckboxCell,
  ComposerFooterBar,
  ComposerMainCard,
  ComposerSelectableRow,
  ComposerShell,
  ComposerSidebarCard,
  ComposerTitleRow,
} from '@/components/seller/composer/ComposerLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiscardChangesDialog, useDirtyCloseGuard } from '@/components/ui/form-overlay';
import {
  type CohortComposerBuyer,
  useCohortComposerData,
  useCohortDetail,
  useCohortMembers,
  useSaveCohortComposer,
} from '@/hooks/useCohorts';
import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';
import { cn, formatCompactInr } from '@/lib/utils';
import { CohortCreateSchema, type CohortRules } from '@/lib/zod';

type ComposerMode = 'create' | 'edit';
type CohortSelectionMode = 'rule-based' | 'manual-selection';

type CohortComposerFieldErrors = {
  name?: string;
  members?: string;
};
type LastOrderBucket = 'anytime' | 'within_30_days' | 'within_90_days' | 'dormant_90_plus_days';
type GmvBucket = 'gmv_0' | 'gmv_1_50000' | 'gmv_50001_200000' | 'gmv_200001_500000' | 'gmv_500001_plus';

const LAST_ORDER_OPTIONS: Array<{ value: LastOrderBucket; label: string }> = [
  { value: 'anytime', label: 'Anytime' },
  { value: 'within_30_days', label: 'Within 30 days' },
  { value: 'within_90_days', label: 'Within 90 days' },
  { value: 'dormant_90_plus_days', label: 'Dormant 90+ days' },
];

const GMV_BUCKET_LABELS: Record<GmvBucket, string> = {
  gmv_0: 'No GMV',
  gmv_1_50000: '₹1 - ₹50k',
  gmv_50001_200000: '₹50k - ₹2L',
  gmv_200001_500000: '₹2L - ₹5L',
  gmv_500001_plus: '₹5L+',
};

function toRelativeDaysLabel(value: string | null) {
  if (!value) return 'Never';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

function deriveLastOrderBucket(value: string | null): LastOrderBucket {
  if (!value) return 'dormant_90_plus_days';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays <= 30) return 'within_30_days';
  if (diffDays <= 90) return 'within_90_days';
  return 'dormant_90_plus_days';
}

function deriveGmvBucket(value: number): GmvBucket {
  if (value <= 0) return 'gmv_0';
  if (value <= 50_000) return 'gmv_1_50000';
  if (value <= 200_000) return 'gmv_50001_200000';
  if (value <= 500_000) return 'gmv_200001_500000';
  return 'gmv_500001_plus';
}

function buildRulesPayload(input: {
  geographies: string[];
  lastOrderBucket: LastOrderBucket;
  gmvBuckets: GmvBucket[];
  selectedBuyerIds: string[];
  excludedBuyerIds: string[];
}) {
  const filters: CohortRules['filters'] = [];

  if (input.geographies.length > 0) filters.push({ field: 'geography.city', operator: 'in', value: input.geographies });
  if (input.lastOrderBucket !== 'anytime') filters.push({ field: 'last_order_bucket', operator: 'eq', value: input.lastOrderBucket });
  if (input.gmvBuckets.length > 0) filters.push({ field: 'gmv_90d_bucket', operator: 'in', value: input.gmvBuckets });

  return {
    filters,
    selected_buyer_ids: input.selectedBuyerIds,
    excluded_buyer_ids: input.excludedBuyerIds,
  };
}

function parseRules(rules: {
  filters?: Array<{ field: string; operator: string; value: string | string[] }>;
  selected_buyer_ids?: string[];
  excluded_buyer_ids?: string[];
} | null | undefined) {
  const geographies = new Set<string>();
  const gmvBuckets = new Set<GmvBucket>();
  let lastOrderBucket: LastOrderBucket = 'anytime';

  for (const filter of rules?.filters ?? []) {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    if (filter.field === 'geography.city') values.forEach((value) => geographies.add(value));
    if (filter.field === 'gmv_90d_bucket') values.forEach((value) => gmvBuckets.add(value as GmvBucket));
    if (filter.field === 'last_order_bucket' && values[0]) lastOrderBucket = values[0] as LastOrderBucket;
  }

  return {
    geographies: Array.from(geographies),
    gmvBuckets: Array.from(gmvBuckets),
    lastOrderBucket,
    selectedBuyerIds: rules?.selected_buyer_ids ?? [],
    excludedBuyerIds: rules?.excluded_buyer_ids ?? [],
  };
}

function matchesStructuredFilters(
  buyer: CohortComposerBuyer,
  filters: {
    geographies: string[];
    lastOrderBucket: LastOrderBucket;
    gmvBuckets: GmvBucket[];
  },
) {
  if (filters.geographies.length > 0 && !filters.geographies.map((g) => g.toLowerCase()).includes((buyer.city ?? '').toLowerCase())) return false;
  if (filters.lastOrderBucket === 'within_30_days' && deriveLastOrderBucket(buyer.last_order_at) !== 'within_30_days') return false;
  if (filters.lastOrderBucket === 'within_90_days') {
    const bucket = deriveLastOrderBucket(buyer.last_order_at);
    if (bucket !== 'within_30_days' && bucket !== 'within_90_days') return false;
  }
  if (filters.lastOrderBucket === 'dormant_90_plus_days' && deriveLastOrderBucket(buyer.last_order_at) !== 'dormant_90_plus_days') return false;
  if (filters.gmvBuckets.length > 0 && !filters.gmvBuckets.includes(deriveGmvBucket(buyer.gmv_90d))) return false;
  return true;
}

function CohortComposerSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading customer group composer"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
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

export function CohortComposer({ mode, cohortId }: { mode: ComposerMode; cohortId?: string }) {
  const router = useRouter();
  const saveMutation = useSaveCohortComposer(cohortId);
  const composerQuery = useCohortComposerData();
  const detailQuery = useCohortDetail(cohortId ?? '');
  const membersQuery = useCohortMembers(cohortId ?? '');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectionMode, setSelectionMode] = useState<CohortSelectionMode>('rule-based');
  const [selectedGeographies, setSelectedGeographies] = useState<string[]>([]);
  const [lastOrderBucket, setLastOrderBucket] = useState<LastOrderBucket>('anytime');
  const [selectedGmvBuckets, setSelectedGmvBuckets] = useState<GmvBucket[]>([]);
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<string[]>([]);
  const [excludedBuyerIds, setExcludedBuyerIds] = useState<string[]>([]);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [didInit, setDidInit] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CohortComposerFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  const isLoading = composerQuery.isLoading || (mode === 'edit' && (detailQuery.isLoading || membersQuery.isLoading));
  const isError = composerQuery.isError || (mode === 'edit' && (detailQuery.isError || membersQuery.isError));

  useEffect(() => {
    if (didInit || !composerQuery.data) return;
    if (mode === 'edit' && (!detailQuery.data || !membersQuery.data)) return;

    if (mode === 'edit' && detailQuery.data) {
      const rulesState = parseRules(detailQuery.data.details_rules.rules as any);
      setName(detailQuery.data.details_rules.name);
      setDescription(detailQuery.data.details_rules.description ?? '');
      setSelectionMode(detailQuery.data.details_rules.is_static ? 'manual-selection' : 'rule-based');
      setSelectedGeographies(rulesState.geographies);
      setLastOrderBucket(rulesState.lastOrderBucket);
      setSelectedGmvBuckets(rulesState.gmvBuckets);
      setExcludedBuyerIds(rulesState.excludedBuyerIds);
      setSelectedBrandIds(detailQuery.data.details_rules.allowed_tenant_brand_ids ?? []);
      setSelectedBuyerIds(
        detailQuery.data.details_rules.is_static
          ? (rulesState.selectedBuyerIds.length > 0
              ? rulesState.selectedBuyerIds
              : (membersQuery.data?.members ?? []).map((member) => member.buyer_id))
          : rulesState.selectedBuyerIds,
      );
    }

    setDidInit(true);
  }, [composerQuery.data, detailQuery.data, didInit, membersQuery.data, mode]);

  const buyerMap = useMemo(
    () => new Map((composerQuery.data?.buyers ?? []).map((buyer) => [buyer.id, buyer])),
    [composerQuery.data?.buyers],
  );
  const brandOptions = composerQuery.data?.brands ?? [];
  const brandLabelById = useMemo(
    () => new Map(brandOptions.map((brand) => [brand.id, brand.label])),
    [brandOptions],
  );

  const matchedByFilters = useMemo(() => {
    return (composerQuery.data?.buyers ?? []).filter((buyer) =>
      matchesStructuredFilters(buyer, {
        geographies: selectedGeographies,
        lastOrderBucket,
        gmvBuckets: selectedGmvBuckets,
      }),
    );
  }, [composerQuery.data?.buyers, lastOrderBucket, selectedGeographies, selectedGmvBuckets]);

  const visibleRows = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return matchedByFilters.filter((buyer) => {
      if (!lowered) return true;
      return [
        buyer.business_name,
        buyer.contact_name ?? '',
        buyer.external_ref ?? '',
        buyer.city ?? '',
        buyer.state ?? '',
      ].some((value) => value.toLowerCase().includes(lowered));
    });
  }, [matchedByFilters, search]);

  const hasActiveFilters = selectedGeographies.length > 0 || lastOrderBucket !== 'anytime' || selectedGmvBuckets.length > 0;

  const effectiveSelectedIds = useMemo(() => {
    if (selectionMode === 'manual-selection') return selectedBuyerIds;
    const excluded = new Set(excludedBuyerIds);
    return matchedByFilters.filter((buyer) => !excluded.has(buyer.id)).map((buyer) => buyer.id);
  }, [excludedBuyerIds, matchedByFilters, selectedBuyerIds, selectionMode]);

  const effectiveSelectedSet = useMemo(() => new Set(effectiveSelectedIds), [effectiveSelectedIds]);
  const visibleSelectedCount = useMemo(
    () => visibleRows.filter((buyer) => effectiveSelectedSet.has(buyer.id)).length,
    [effectiveSelectedSet, visibleRows],
  );

  const selectedRows = useMemo(
    () => effectiveSelectedIds.map((id) => buyerMap.get(id)).filter((buyer): buyer is CohortComposerBuyer => Boolean(buyer)),
    [buyerMap, effectiveSelectedIds],
  );

  const summary = useMemo(() => {
    const members = selectedRows.length;
    const areasCovered = new Set(selectedRows.map((buyer) => buyer.city).filter((value) => value && value !== '—')).size;
    const mtdSpend = selectedRows.reduce((sum, buyer) => sum + buyer.mtd_spend, 0);
    const ordersMtd = selectedRows.reduce((sum, buyer) => sum + buyer.orders_mtd, 0);
    const avgAov = ordersMtd > 0 ? mtdSpend / ordersMtd : 0;
    const active30d = selectedRows.filter((buyer) => deriveLastOrderBucket(buyer.last_order_at) === 'within_30_days').length;
    return { members, areasCovered, mtdSpend, avgAov, active30d };
  }, [selectedRows]);

  const serializedState = useMemo(
    () =>
      JSON.stringify({
        name,
        description,
        selectionMode,
        selectedGeographies,
        lastOrderBucket,
        selectedGmvBuckets,
        selectedBuyerIds: [...selectedBuyerIds].sort(),
        excludedBuyerIds: [...excludedBuyerIds].sort(),
        selectedBrandIds: [...selectedBrandIds].sort(),
      }),
    [
      description,
      excludedBuyerIds,
      lastOrderBucket,
      name,
      selectedBuyerIds,
      selectedBrandIds,
      selectedGeographies,
      selectedGmvBuckets,
      selectionMode,
    ],
  );

  useEffect(() => {
    if (!didInit || initialSnapshot) return;
    setInitialSnapshot(serializedState);
  }, [didInit, initialSnapshot, serializedState]);

  const isDirty = didInit && Boolean(initialSnapshot) && serializedState !== initialSnapshot;
  const isLiveEdit = mode === 'edit';

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const closeTarget = mode === 'edit' && cohortId ? `/customer-groups/${cohortId}` : '/customer-groups';
  const dirtyGuard = useDirtyCloseGuard({
    isDirty,
    onConfirmClose: () => router.push(closeTarget),
  });

  const pendingSaveSummary = useMemo(
    () => [
      { label: 'Name', value: name.trim() || 'Untitled customer group' },
      {
        label: 'Type',
        value: selectionMode === 'manual-selection' ? 'Manual selection' : 'Rule-based',
      },
      { label: 'Members', value: `${summary.members} buyers` },
      { label: 'Areas', value: `${summary.areasCovered} geographies` },
      { label: 'Brands', value: selectedBrandIds.length > 0 ? `${selectedBrandIds.length} selected` : 'All Brands' },
    ],
    [name, selectedBrandIds.length, selectionMode, summary.areasCovered, summary.members],
  );

  function buildSavePayload() {
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      is_static: selectionMode === 'manual-selection',
      allowed_tenant_brand_ids: selectedBrandIds.length > 0 ? selectedBrandIds : null,
      rules: buildRulesPayload({
        geographies: selectedGeographies,
        lastOrderBucket,
        gmvBuckets: selectedGmvBuckets,
        selectedBuyerIds,
        excludedBuyerIds,
      }),
    };
  }

  function clearFieldError(field: keyof CohortComposerFieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validateBeforeSave() {
    const payload = buildSavePayload();
    const nextErrors: CohortComposerFieldErrors = {};
    const parsed = CohortCreateSchema.safeParse(payload);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? '');
        if (path === 'name') nextErrors.name = issue.message;
      }
    }

    if (summary.members === 0) {
      nextErrors.members =
        selectionMode === 'manual-selection'
          ? 'Select at least one buyer to save this cohort.'
          : 'Adjust the rules or include buyers so this cohort has at least one member.';
    }

    setFieldErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, payload: parsed.success ? parsed.data : null };
  }

  async function handleSave(redirect: 'detail' | 'list') {
    setSubmitError(null);
    const { isValid, payload } = validateBeforeSave();
    if (!isValid || !payload) return;

    try {
      const result = await saveMutation.mutateAsync(payload);
      setInitialSnapshot(serializedState);

      if (redirect === 'detail') {
        router.push(`/customer-groups/${result.cohort.id}`);
        return;
      }

      router.push('/customer-groups');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save cohort');
    }
  }

  async function handleSaveClick() {
    if (isLiveEdit) {
      setConfirmSaveOpen(true);
      return;
    }
    await handleSave('detail');
  }

  function handleResetSelection() {
    if (selectionMode === 'manual-selection') setSelectedBuyerIds([]);
    else setExcludedBuyerIds([]);
    setSearch('');
    clearFieldError('members');
    setSubmitError(null);
  }

  function toggleMany(current: string[], allValues: string[], setter: (values: string[]) => void) {
    setter(current.length === allValues.length ? [] : allValues);
  }

  function toggleManualRow(id: string, checked: boolean) {
    setSelectedBuyerIds((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id),
    );
    clearFieldError('members');
    setSubmitError(null);
  }

  function toggleBrand(id: string) {
    setSelectedBrandIds((current) => (
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    ));
  }

  function toggleRuleRow(id: string, checked: boolean) {
    setExcludedBuyerIds((current) => (checked ? current.filter((value) => value !== id) : Array.from(new Set([...current, id]))));
    clearFieldError('members');
    setSubmitError(null);
  }

  if (isLoading || !didInit) {
    return <CohortComposerSkeleton />;
  }

  if (isError || !composerQuery.data) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 py-6">
        <div className="rounded-[18px] border border-danger-200 bg-danger-50 p-5 text-base text-danger-700">
          We couldn&apos;t load this customer group composer right now.
        </div>
      </div>
    );
  }

  const createSubtitle = 'Group buyers by geography, tier, or activity. Pricelists and campaigns target a customer group, not a one-off buyer list.';
  const editSubtitle = isLiveEdit
    ? 'You are editing a live customer group. Save applies membership and rule changes immediately for pricelists and campaigns targeting this customer group.'
    : 'Review the buyer set, adjust rules or manual membership, and save when the customer group profile looks right.';
  const visibleIds = visibleRows.map((buyer) => buyer.id);
  const footerStatusText = isDirty
    ? 'Unsaved changes'
    : isLiveEdit
      ? 'Live customer group · no pending edits'
      : 'Save to create this customer group';

  return (
    <>
      <PageWrap className={cn('flex flex-col', composerPageMinHeightClass, 'pt-7 pb-6')}>
        <ComposerShell>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
          <ComposerBreadcrumbs
            items={[
              { label: 'Customer Groups', href: '/customer-groups' },
              { label: mode === 'edit' ? detailQuery.data?.details_rules.name ?? 'Edit customer group' : 'New customer group', current: true },
            ]}
          />

          <ComposerTitleRow
            title={mode === 'edit' ? 'Edit customer group' : 'Add a customer group'}
            subtitle={mode === 'edit' ? editSubtitle : createSubtitle}
            status={{ label: mode === 'edit' ? 'Live' : 'Draft', tone: mode === 'edit' ? 'live' : 'draft' }}
            actions={
              <Button type="button" variant='ghost' onClick={() => dirtyGuard.handleOpenChange(false)}>
                <X className="h-3.5 w-3.5" />
                Close
              </Button>
            }
          />

          <ComposerBasicsStrip columnsClassName="lg:grid-cols-[1.35fr_1.1fr_0.9fr_1fr]">
            <ComposerBasicsField label="Name">
              <Input
                value={name}
                error={fieldErrors.name}
                onChange={(event) => {
                  setName(event.target.value);
                  clearFieldError('name');
                  setSubmitError(null);
                }}
                placeholder="Customer group name"
                className="h-auto border-0 bg-transparent px-0 py-0 font-medium text-base text-cream-950 shadow-none focus-visible:ring-0"
              />
            </ComposerBasicsField>

            <ComposerBasicsField label="Description">
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional description"
                className="h-auto border-0 bg-transparent px-0 py-0 text-base text-cream-700 shadow-none focus-visible:ring-0"
              />
            </ComposerBasicsField>

            <ComposerBasicsField label="Type">
              <Select value={selectionMode} onValueChange={(value) => setSelectionMode(value as CohortSelectionMode)}>
                <SelectTrigger className="h-auto border-0 bg-transparent px-0 py-0 text-base font-medium shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rule-based">Rule-based</SelectItem>
                  <SelectItem value="manual-selection">Manual selection</SelectItem>
                </SelectContent>
              </Select>
            </ComposerBasicsField>

            <ComposerBasicsField label="Allowed brands">
              <div className="space-y-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-between border-cream-300 bg-cream-50 px-3 py-2 text-left font-normal text-cream-900"
                    >
                      <span>
                        {selectedBrandIds.length > 0
                          ? `${selectedBrandIds.length} brand${selectedBrandIds.length === 1 ? '' : 's'} selected`
                          : 'All Brands'}
                      </span>
                      <ChevronsUpDown size={14} className="text-cream-500" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0 bg-cream-50" align="start">
                    <Command>
                      <CommandInput placeholder="Search brands…" className="bg-cream-50" />
                      <CommandList>
                        <CommandEmpty>No brands found.</CommandEmpty>
                        <CommandGroup>
                          {brandOptions.map((brand) => {
                            const isSelected = selectedBrandIds.includes(brand.id);
                            return (
                              <CommandItem
                                key={brand.id}
                                value={brand.label}
                                onSelect={() => toggleBrand(brand.id)}
                                className="flex cursor-pointer items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-teal-500 bg-teal-500' : 'border-cream-400 bg-cream-50'}`}>
                                    {isSelected ? <Check size={10} className="text-white" /> : null}
                                  </div>
                                  <span className="text-sm text-cream-900">{brand.label}</span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-cream-600">
                  Leave empty to allow all brands. Select one or more brands to restrict this customer group&apos;s assortment.
                </p>
                {selectedBrandIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedBrandIds.map((brandId) => (
                      <span key={brandId} className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                        {brandLabelById.get(brandId) ?? 'Brand'}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
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
              <AlertTitle>Couldn&apos;t save customer group</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}

          {isLiveEdit ? (
            <Alert variant="warning">
              <AlertTitle>Editing a live customer group</AlertTitle>
              <AlertDescription>
                Save applies updates immediately. Pricelists and campaigns mapped to this customer group will use the updated buyer membership.
              </AlertDescription>
            </Alert>
          ) : null}

          <ComposerBodyGrid
            left={
              <ComposerSidebarCard>
                <div className="space-y-5">
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Geography</h3>
                      <button
                        type="button"
                        className="text-sm font-medium text-teal-700 hover:text-teal-800"
                        onClick={() =>
                          toggleMany(
                            selectedGeographies,
                            composerQuery.data.filters.geographies.map((option) => option.value),
                            setSelectedGeographies,
                          )
                        }
                      >
                        {selectedGeographies.length === composerQuery.data.filters.geographies.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {composerQuery.data.filters.geographies.map((option) => (
                        <label key={option.value} className="flex items-center justify-between gap-3 text-base text-cream-900">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedGeographies.includes(option.value)}
                              onChange={(event) =>
                                setSelectedGeographies((current) =>
                                  event.target.checked
                                    ? [...current, option.value]
                                    : current.filter((value) => value !== option.value),
                                )
                              }
                              className="accent-teal-500"
                            />
                            <span>{option.label}</span>
                          </span>
                          <span className="font-mono text-xs text-cream-700">{option.count}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Last ordered</h3>
                    <div className="space-y-2">
                      {LAST_ORDER_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center justify-between gap-3 text-base text-cream-900">
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="last-ordered"
                              checked={lastOrderBucket === option.value}
                              onChange={() => setLastOrderBucket(option.value)}
                              className="accent-teal-500"
                            />
                            <span>{option.label}</span>
                          </span>
                          <span className="font-mono text-xs text-cream-700">
                            {composerQuery.data.filters.last_order_buckets.find((bucket) => bucket.value === option.value)?.count ?? 0}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Last 90 days GMV</h3>
                      <button
                        type="button"
                        className="text-sm font-medium text-teal-700 hover:text-teal-800"
                        onClick={() =>
                          toggleMany(
                            selectedGmvBuckets,
                            composerQuery.data.filters.gmv_90d_buckets.map((option) => option.value as GmvBucket),
                            (values) => setSelectedGmvBuckets(values as GmvBucket[]),
                          )
                        }
                      >
                        {selectedGmvBuckets.length === composerQuery.data.filters.gmv_90d_buckets.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {composerQuery.data.filters.gmv_90d_buckets.map((option) => (
                        <label key={option.value} className="flex items-center justify-between gap-3 text-base text-cream-900">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedGmvBuckets.includes(option.value as GmvBucket)}
                              onChange={(event) =>
                                setSelectedGmvBuckets((current) =>
                                  event.target.checked
                                    ? [...current, option.value as GmvBucket]
                                    : current.filter((value) => value !== option.value),
                                )
                              }
                              className="accent-teal-500"
                            />
                            <span>{GMV_BUCKET_LABELS[option.value as GmvBucket] ?? option.label}</span>
                          </span>
                          <span className="font-mono text-xs text-cream-700">{option.count}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>
              </ComposerSidebarCard>
            }
            center={
              <ComposerMainCard>
                <div className="flex flex-wrap items-center gap-3 border-b border-cream-300 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-cream-950">
                      {selectionMode === 'manual-selection'
                        ? `${selectedBuyerIds.length} buyers selected manually`
                        : hasActiveFilters
                          ? `${effectiveSelectedIds.length}+ buyers match the rules above`
                          : `${composerQuery.data?.total_buyer_count ?? effectiveSelectedIds.length} buyers total`}
                    </p>
                    <p className="mt-1 max-w-[38rem] text-sm leading-[1.5] text-cream-700">
                      {selectionMode === 'manual-selection'
                        ? 'Apply filters, then select buyers to include in this cohort.'
                        : 'Uncheck buyers you want to exclude from this cohort.'}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="flex min-w-[240px] items-center gap-2 rounded-[8px] border border-cream-300 bg-white px-3 py-2 text-base text-cream-700">
                      <Search className="h-4 w-4 shrink-0 text-cream-600" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search name, contact, city"
                        className="w-full bg-transparent outline-none placeholder:text-cream-600"
                      />
                    </div>
                    <Button type="button" variant="ghost" onClick={handleResetSelection}>
                      Reset selection
                    </Button>
                  </div>
                </div>

                {fieldErrors.members ? (
                  <div className="border-b border-cream-300 px-5 py-3">
                    <Alert variant="warning">
                      <AlertDescription>{fieldErrors.members}</AlertDescription>
                    </Alert>
                  </div>
                ) : null}

                {visibleRows.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center px-8 py-16 text-center">
                    <div className="space-y-2">
                      <h2 className="font-display text-xl font-medium tracking-[-0.01em] text-cream-900">
                        No buyers match the current filters
                      </h2>
                      <p className="text-base leading-[1.55] text-cream-700">
                        Clear a few filters or search terms to bring buyers back into the cohort table.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full border-collapse text-base">
                    <thead className="sticky top-0 z-[1] bg-cream-50">
                      <tr>
                        <th className="w-9 border-b border-cream-300 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">
                          <input
                            type="checkbox"
                            checked={visibleRows.length > 0 && visibleSelectedCount === visibleRows.length}
                            onChange={(event) => {
                              if (selectionMode === 'manual-selection') {
                                setSelectedBuyerIds((current) => {
                                  if (event.target.checked) return Array.from(new Set([...current, ...visibleIds]));
                                  return current.filter((id) => !visibleIds.includes(id));
                                });
                                return;
                              }

                              setExcludedBuyerIds((current) =>
                                event.target.checked
                                  ? current.filter((id) => !visibleIds.includes(id))
                                  : Array.from(new Set([...current, ...visibleIds])),
                              );
                            }}
                            className="accent-teal-500"
                          />
                        </th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Business name</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Geography</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Tier</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Last order</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">MTD spend</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Credit used</th>
                        <th className="border-b border-cream-300 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Payment terms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((buyer) => {
                        const checked = effectiveSelectedSet.has(buyer.id);
                        return (
                          <ComposerSelectableRow
                            key={buyer.id}
                            checked={checked}
                            onCheckedChange={(nextChecked) =>
                              selectionMode === 'manual-selection'
                                ? toggleManualRow(buyer.id, nextChecked)
                                : toggleRuleRow(buyer.id, nextChecked)
                            }
                          >
                            <ComposerCheckboxCell
                              checked={checked}
                              onCheckedChange={(nextChecked) =>
                                selectionMode === 'manual-selection'
                                  ? toggleManualRow(buyer.id, nextChecked)
                                  : toggleRuleRow(buyer.id, nextChecked)
                              }
                            />
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <EntityAvatar initials={buyer.initials} hue={buyer.hue} size={32} className="rounded-[8px]" />
                                <div className="min-w-0">
                                  <p className="truncate text-base font-medium text-cream-900">{buyer.business_name}</p>
                                  <p className="mt-0.5 truncate text-xs text-cream-700">
                                    {buyer.contact_name || buyer.external_ref || 'No buyer contact'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-cream-900">{buyer.geography_label}</td>
                            <td className="px-4 py-3 font-mono text-cream-900">
                              {buyer.tier ? `${buyer.tier}-class` : 'Unsorted'}
                            </td>
                            <td className="px-4 py-3 text-cream-900">{toRelativeDaysLabel(buyer.last_order_at)}</td>
                            <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{formatCompactInr(buyer.mtd_spend)}</td>
                            <td className="px-4 py-3 text-right font-mono font-medium text-cream-900">{formatCompactInr(buyer.credit_used)}</td>
                            <td className="px-4 py-3 text-right font-mono text-cream-700">Net {buyer.payment_terms_days}</td>
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
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Customer group profile</h3>
                  <div className="mt-4">
                    <p className="font-display text-lg font-medium tracking-[-0.005em] text-cream-900">
                      {name || 'Untitled customer group'}
                    </p>
                    <p className="mt-1 text-sm text-cream-700">
                      {selectionMode === 'manual-selection'
                        ? 'Manual selection · fixed membership until you edit it again'
                        : 'Rule-based · buyer membership follows the current rules'}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-cream-300" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-base">
                    <span className="text-cream-700">Members</span>
                    <span className="font-mono font-medium text-cream-900">{summary.members}</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="text-cream-700">Areas covered</span>
                    <span className="font-mono font-medium text-cream-900">{summary.areasCovered}</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="text-cream-700">MTD spend</span>
                    <span className="font-mono font-medium text-cream-900">{formatCompactInr(summary.mtdSpend)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="text-cream-700">Avg AOV</span>
                    <span className="font-mono font-medium text-cream-900">{summary.avgAov > 0 ? formatCompactInr(summary.avgAov) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="text-cream-700">Active · 30d</span>
                    <span className="font-mono font-medium text-cream-900">
                      {summary.active30d} / {summary.members}
                    </span>
                  </div>
                </div>

                {isLiveEdit ? (
                  <>
                    <div className="h-px bg-cream-300" />
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Next save</h4>
                      <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3">
                        <div className="space-y-2 text-sm leading-[1.5] text-amber-900">
                          {pendingSaveSummary.map((item) => (
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

                <div
                  className={cn(
                    'mt-auto rounded-[10px] px-3 py-3 text-sm leading-[1.5]',
                    isLiveEdit
                      ? 'border border-amber-200 bg-amber-50 text-amber-800'
                      : summary.members > 0
                        ? 'border border-teal-200 bg-teal-50 text-teal-700'
                        : 'border border-warning-500/30 bg-warning-50 text-warning-700',
                  )}
                >
                  <div className="flex gap-2">
                    {isLiveEdit || summary.members === 0 ? (
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    ) : (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    )}
                    <span>
                      {isLiveEdit
                        ? 'Save applies these edits to the live customer group immediately. Review membership before confirming.'
                        : summary.members > 0
                          ? 'Ready to save. You can target this customer group from pricelists and campaigns after this.'
                          : 'Add a few buyers through rules or manual selection to make this customer group useful downstream.'}
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
                {footerStatusText}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => dirtyGuard.handleOpenChange(false)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {mode === 'edit' ? 'Revert changes' : 'Discard draft'}
                </Button>
                <Button
                  type="button"
                  variant={isLiveEdit ? 'accent' : 'primary'}
                  className={isLiveEdit ? undefined : 'cockpit-btn cockpit-btn-primary'}
                  onClick={() => void handleSaveClick()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {isLiveEdit ? 'Save changes' : 'Save customer group'}
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

      <Dialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Save customer group changes?</DialogTitle>
            <DialogDescription>
              This updates membership and rules for the live customer group. Pricelists and campaigns targeting it will use the updated buyer set.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-4 text-base leading-6 text-cream-700">
            {summary.members} buyers across {summary.areasCovered} areas will be in this cohort once you confirm.
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setConfirmSaveOpen(false);
                await handleSave('detail');
              }}
              disabled={saveMutation.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
