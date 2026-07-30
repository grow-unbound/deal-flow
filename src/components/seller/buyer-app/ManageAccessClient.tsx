'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn, formatNumberValue } from '@/lib/utils';
import { FeatureGate } from '@/components/FeatureGate';
import {
  PageWrap,
  FilterBar,
  ScrollableTableShell,
  type FilterBarGroup,
} from '@/components/seller/layout';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import {
  BuyerAppAccessConfirmDialog,
  type BuyerAppAccessConfirmMode,
} from '@/components/seller/buyer-app/BuyerAppAccessConfirmDialog';
import {
  isBuyerAppDisableConfirmSkipped,
  isBuyerAppEnableConfirmSkipped,
  setBuyerAppDisableConfirmSkipped,
  setBuyerAppEnableConfirmSkipped,
} from '@/lib/buyer-app-access-confirm';
import { showBuyerAppAccessChangeToasts } from '@/lib/buyer-app-access-toast';
import {
  useAccessList,
  useBuyerAppEnablePreview,
  useToggleBuyerAccess,
  type AccessBuyer,
  type AccessKpis,
  type AccessPageResponse,
} from '@/hooks/useBuyerAppAccess';

// ─── Filter state ─────────────────────────────────────────────────────────────

interface AccessFilter {
  status: string[];       // 'enabled' | 'disabled' | 'inactive'
  suggested: string[];    // 'suggested'
  last_ordered: string[]; // '30d' | '90d' | 'dormant'
  search: string;
  sortBy: string;
}

const SORT_OPTIONS = [
  'Business name (A→Z)',
  'App GMV (high→low)',
  'Offline spend (high→low)',
  'Last ordered',
];

const DEFAULT_FILTER: AccessFilter = {
  status: [],
  suggested: [],
  last_ordered: [],
  search: '',
  sortBy: SORT_OPTIONS[0],
};

// ─── KPI tiles ───────────────────────────────────────────────────────────────

interface KpiConfig {
  label: string;
  getValue: (kpis: AccessKpis) => number;
  getSub: (kpis: AccessKpis) => string;
  isActive: (filter: AccessFilter) => boolean;
  applyFilter: (prev: AccessFilter) => AccessFilter;
  tone?: 'warn';
}

const KPI_CONFIGS: KpiConfig[] = [
  {
    label: 'Enabled buyers',
    getValue: (k) => k.enabled_count,
    getSub: (k) =>
      k.total_count > 0
        ? `${Math.round((k.enabled_count / k.total_count) * 100)}% of buyer base`
        : '0% of buyer base',
    isActive: (f) => f.status.includes('enabled') && !f.suggested.includes('suggested'),
    applyFilter: (prev) => ({ ...prev, status: ['enabled'], suggested: [] }),
  },
  {
    label: 'Not yet enabled',
    getValue: (k) => k.not_enabled_count,
    getSub: (k) =>
      k.total_count > 0
        ? `${Math.round((k.not_enabled_count / k.total_count) * 100)}% of buyer base`
        : '0% of buyer base',
    isActive: (f) => f.status.includes('disabled') && !f.suggested.includes('suggested'),
    applyFilter: (prev) => ({ ...prev, status: ['disabled'], suggested: [] }),
  },
  {
    label: 'Suggested to enable',
    getValue: (k) => k.suggested_count,
    getSub: () => 'offline spend, no app access',
    isActive: (f) => f.suggested.includes('suggested'),
    applyFilter: (prev) => ({ ...prev, status: ['disabled'], suggested: ['suggested'] }),
  },
  {
    label: 'Enabled, inactive',
    getValue: (k) => k.inactive_count,
    getSub: () => 'no app orders in 30 days',
    isActive: (f) => f.status.includes('inactive') && !f.suggested.includes('suggested'),
    applyFilter: (prev) => ({ ...prev, status: ['inactive'], suggested: [] }),
    tone: 'warn',
  },
];

function AccessKpiStrip({
  kpis,
  filter,
  onFilterChange,
}: {
  kpis: AccessKpis;
  filter: AccessFilter;
  onFilterChange: (f: AccessFilter) => void;
}) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {KPI_CONFIGS.map((cfg) => {
        const active = cfg.isActive(filter);
        return (
          <button
            key={cfg.label}
            type="button"
            onClick={() =>
              onFilterChange(
                active ? { ...filter, status: [], suggested: [] } : cfg.applyFilter(filter),
              )
            }
            className={cn(
              'rounded-[14px] border px-[18px] py-[16px] text-left transition-all',
              active
                ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-300'
                : cfg.tone === 'warn'
                  ? 'border-ember-300 bg-white hover:border-ember-400'
                  : 'border-cream-300 bg-white hover:border-cream-400',
            )}
          >
            <p
              className={cn(
                'eyebrow',
                active
                  ? 'text-teal-700'
                  : cfg.tone === 'warn'
                    ? 'text-ember-700'
                    : 'text-cream-600',
              )}
            >
              {cfg.label}
            </p>
            <p
              className={cn(
                'mt-2 font-display text-2xl font-medium leading-[1.05] tracking-[-0.015em] tabular-nums',
                active
                  ? 'text-teal-900'
                  : cfg.tone === 'warn'
                    ? 'text-ember-600'
                    : 'text-[#4A3F35]',
              )}
            >
              {cfg.getValue(kpis)}
            </p>
            <p
              className={cn(
                'mt-2 text-sm',
                active
                  ? 'text-teal-600'
                  : cfg.tone === 'warn'
                    ? 'text-ember-600'
                    : 'text-cream-600',
              )}
            >
              {cfg.getSub(kpis)}
            </p>
          </button>
        );
      })}
    </section>
  );
}


// ─── Bulk action toolbar ──────────────────────────────────────────────────────

function BulkActionBar({
  selectedCount,
  onEnable,
  onDisable,
  onClear,
  isPending,
}: {
  selectedCount: number;
  onEnable: () => void;
  onDisable: () => void;
  onClear: () => void;
  isPending: boolean;
}) {
  return (
    <div className="mt-5 flex items-center gap-3 rounded-[12px] border border-teal-200 bg-teal-50 px-4 py-2.5">
      <span className="text-sm font-medium text-teal-800">{selectedCount} selected</span>
      <div className="h-4 w-px bg-teal-200" />
      <Button size="sm" disabled={isPending} onClick={onEnable}>
        Enable selected
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={onDisable}>
        Disable selected
      </Button>
      <button
        type="button"
        className="ml-auto text-sm text-teal-600 hover:text-teal-900"
        onClick={onClear}
      >
        Clear selection
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function filterAndSortBuyers(
  buyers: AccessBuyer[],
  filter: AccessFilter,
  applyInterimFilters: boolean,
): AccessBuyer[] {
  if (!applyInterimFilters) return buyers;

  let result = buyers;

  if (filter.status.includes('inactive')) result = result.filter((b) => b.is_inactive);
  else if (filter.status.includes('enabled')) {
    result = result.filter((b) => b.buyer_app_enabled);
  } else if (filter.status.includes('disabled')) {
    result = result.filter((b) => !b.buyer_app_enabled);
  }

  if (filter.suggested.includes('suggested')) result = result.filter((b) => b.is_suggested);

  const now = Date.now();
  if (filter.last_ordered.includes('30d')) {
    const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    result = result.filter((b) => b.last_app_order_at && b.last_app_order_at >= cutoff);
  } else if (filter.last_ordered.includes('90d')) {
    const cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    result = result.filter((b) => b.last_app_order_at && b.last_app_order_at >= cutoff);
  } else if (filter.last_ordered.includes('dormant')) {
    const cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    result = result.filter((b) => !b.last_app_order_at || b.last_app_order_at < cutoff);
  }

  const interimSearch = filter.search.trim();
  if (interimSearch) {
    const q = interimSearch.toLowerCase();
    result = result.filter(
      (b) =>
        b.business_name.toLowerCase().includes(q) ||
        b.contact_name?.toLowerCase().includes(q) ||
        b.city?.toLowerCase().includes(q) ||
        b.state?.toLowerCase().includes(q),
    );
  }

  return [...result].sort((a, b) => {
    if (filter.sortBy === 'App GMV (high→low)') return b.app_gmv_90d - a.app_gmv_90d;
    if (filter.sortBy === 'Offline spend (high→low)') return b.offline_spend_90d - a.offline_spend_90d;
    if (filter.sortBy === 'Last ordered') {
      const aDate = a.last_app_order_at ? Date.parse(a.last_app_order_at) : 0;
      const bDate = b.last_app_order_at ? Date.parse(b.last_app_order_at) : 0;
      return bDate - aDate;
    }
    return a.business_name.localeCompare(b.business_name);
  });
}

// ─── Table ───────────────────────────────────────────────────────────────────

function AccessTable({
  buyers,
  selectedIds,
  pendingToggles,
  onSelectionChange,
  onToggle,
}: {
  buyers: AccessBuyer[];
  selectedIds: string[];
  pendingToggles: Record<string, boolean>;
  onSelectionChange: (ids: string[]) => void;
  onToggle: (buyerId: string, enabled: boolean) => void;
}) {
  const allSelected = buyers.length > 0 && buyers.every((b) => selectedIds.includes(b.id));
  const someSelected = buyers.some((b) => selectedIds.includes(b.id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      onSelectionChange(selectedIds.filter((id) => !buyers.some((b) => b.id === id)));
    } else {
      onSelectionChange([...new Set([...selectedIds, ...buyers.map((b) => b.id)])]);
    }
  }

  function toggleRow(id: string) {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
    );
  }

  return (
    <ScrollableTableShell className="rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
      <table
        className="landing-table w-full table-fixed border-collapse text-base"
        style={{ minWidth: 1080 }}
      >
        <thead>
          <tr className="border-y border-cream-300 bg-white">
            <th className="w-10 py-[11px] pl-5 pr-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all"
                className={someSelected ? 'data-[state=unchecked]:bg-cream-300' : ''}
              />
            </th>
            <th
              className="table-label px-5 py-[11px] text-left text-cream-700"
              style={{ width: 400, minWidth: 260 }}
            >
              Buyer
            </th>
            <th
              className="table-label px-5 py-[11px] text-left text-cream-700"
              style={{ minWidth: 140 }}
            >
              Buyer City
            </th>
            <th
              className="table-label px-5 py-[11px] text-left text-cream-700"
              style={{ minWidth: 150 }}
            >
              App Access
            </th>
            <th
              className="table-label px-5 py-[11px] text-right text-cream-700"
              style={{ minWidth: 200 }}
            >
              Last App Order
            </th>
            <th
              className="table-label px-5 py-[11px] text-right text-cream-700"
              style={{ minWidth: 200 }}
            >
              Offline / Total · 90d
            </th>
            <th
              className="table-label px-5 py-[11px] text-right text-cream-700"
              style={{ minWidth: 200 }}
            >
              Demand from App · 90d
            </th>
          </tr>
        </thead>
        <tbody>
          {buyers.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-16 text-center text-sm text-cream-500">
                No buyers match these filters.
              </td>
            </tr>
          ) : (
            buyers.map((buyer, i) => {
              const isSelected = selectedIds.includes(buyer.id);
              return (
                <tr
                  key={buyer.id}
                  className={cn(
                    'border-b border-cream-300 transition-colors duration-fast',
                    i === buyers.length - 1 && 'border-b-0',
                    isSelected ? 'bg-teal-50/50' : 'bg-white hover:bg-cream-50',
                  )}
                >
                  <td className="py-3.5 pl-5 pr-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleRow(buyer.id)}
                      aria-label="Select row"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-base font-medium text-cream-900">{buyer.business_name}</p>
                    {buyer.phone ? (
                      <p className="mt-0.5 text-xs text-cream-500">
                        {buyer.phone ? buyer.phone : null}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-sm text-cream-700">
                    {buyer.city && buyer.state
                      ? `${buyer.city}, ${buyer.state}`
                      : buyer.city ?? buyer.state ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Switch
                        checked={pendingToggles[buyer.id] ?? buyer.buyer_app_enabled}
                        onCheckedChange={(checked) => onToggle(buyer.id, checked)}
                      />
                      {buyer.is_suggested ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Suggested
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="tabular-inline text-sm text-cream-700">
                      {formatDate(buyer.last_app_order_at)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {buyer.total_spend_90d > 0 ? (
                      <span className="font-display text-md font-medium tabular-nums text-cream-900">
                        {formatNumberValue(buyer.offline_spend_90d, 'CURRENCY_THRESHOLD')}
                        <span className="font-sans font-normal text-cream-400"> / </span>
                        {formatNumberValue(buyer.total_spend_90d, 'CURRENCY_THRESHOLD')}
                      </span>
                    ) : (
                      <span className="text-sm text-cream-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-display text-sm font-medium tabular-nums text-cream-900">
                      {buyer.buyer_app_enabled && buyer.app_gmv_90d > 0
                        ? formatNumberValue(buyer.app_gmv_90d, 'CURRENCY_THRESHOLD')
                        : '—'}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </ScrollableTableShell>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ManageAccessSkeleton() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-5">
        {/* Header */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-[14px]" />
          ))}
        </div>

        {/* FilterBar + Table connected */}
        <div>
          <Skeleton className="h-[46px] rounded-t-[14px] rounded-b-none border-b-0" />
          <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
            {/* Column header row */}
            <div className="border-b border-cream-200 px-5 py-[11px]">
              <div className="grid grid-cols-[40px_260px_140px_200px_140px_180px_140px] gap-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-3" />
                ))}
              </div>
            </div>
            {/* Rows */}
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="border-b border-cream-100 px-3 py-2 last:border-b-0"
              >
                <div className="grid grid-cols-[40px_260px_140px_200px_140px_180px_140px] gap-4">
                  <Skeleton className="h-4 w-4" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="ml-auto h-4 w-14" />
                  <Skeleton className="ml-auto h-4 w-20" />
                  <Skeleton className="ml-auto h-4 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function resolveBuyerLabel(buyer: AccessBuyer): string {
  return buyer.contact_name?.trim() || buyer.business_name;
}

function ManageAccessContent({ initialData }: { initialData: AccessPageResponse | null }) {
  const [filter, setFilter] = useState<AccessFilter>(DEFAULT_FILTER);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    mode: BuyerAppAccessConfirmMode;
    buyerIds: string[];
    singleBuyerLabel: string | null;
  }>({
    open: false,
    mode: 'enable',
    buyerIds: [],
    singleBuyerLabel: null,
  });
  const pageSize = initialData?.limit ?? 50;
  const [querySearch, setQuerySearch] = useState('');
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({});
  const pendingOnDoneRef = useRef<(() => void) | null>(null);

  const clearPendingToggles = useCallback((buyerIds: string[]) => {
    setPendingToggles((current) => {
      if (buyerIds.length === 0) return current;
      const next = { ...current };
      for (const buyerId of buyerIds) {
        delete next[buyerId];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuerySearch(filter.search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [filter.search, pageSize]);

  const serverStatus = useMemo<'all' | 'enabled' | 'disabled' | 'suggested' | 'inactive'>(() => {
    if (filter.suggested.includes('suggested')) return 'suggested';
    if (filter.status.includes('inactive')) return 'inactive';
    if (filter.status.includes('enabled')) return 'enabled';
    if (filter.status.includes('disabled')) return 'disabled';
    return 'all';
  }, [filter.status, filter.suggested]);

  const serverLastOrdered = useMemo<'all' | '30d' | '90d' | 'dormant'>(() => {
    if (filter.last_ordered.includes('30d')) return '30d';
    if (filter.last_ordered.includes('90d')) return '90d';
    if (filter.last_ordered.includes('dormant')) return 'dormant';
    return 'all';
  }, [filter.last_ordered]);

  const serverSort = useMemo<'business_name' | 'app_gmv' | 'offline_spend' | 'last_ordered'>(() => {
    if (filter.sortBy === 'App GMV (high→low)') return 'app_gmv';
    if (filter.sortBy === 'Offline spend (high→low)') return 'offline_spend';
    if (filter.sortBy === 'Last ordered') return 'last_ordered';
    return 'business_name';
  }, [filter.sortBy]);

  const {
    data,
    isLoading,
    isError,
    isPlaceholderData,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    authoritativeKpis,
  } = useAccessList(
    {
      q: querySearch,
      status: serverStatus,
      lastOrdered: serverLastOrdered,
      sort: serverSort,
      limit: pageSize,
    },
    initialData,
  );
  const toggleMutation = useToggleBuyerAccess();
  const enablePreviewQuery = useBuyerAppEnablePreview(
    confirmDialog.buyerIds,
    confirmDialog.open && confirmDialog.mode === 'enable',
  );

  const pages = data?.pages ?? [];
  const buyers = useMemo(() => pages.flatMap((page) => page.buyers), [pages]);
  const latestPage = pages.at(-1);
  const isInterim = filter.search.trim() !== querySearch || isPlaceholderData;

  const filteredBuyers = useMemo(
    () => filterAndSortBuyers(buyers, filter, isInterim),
    [buyers, filter, isInterim],
  );

  const buyerById = useMemo(
    () => new Map(buyers.map((buyer) => [buyer.id, buyer])),
    [buyers],
  );

  const applyAccessChange = useCallback((buyerIds: string[], enabled: boolean, onDone?: () => void) => {
    toggleMutation.mutate(
      { buyer_ids: buyerIds, enabled },
      {
        onSuccess: (data) => {
          showBuyerAppAccessChangeToasts({
            buyerCount: buyerIds.length,
            enabled,
            data,
            onUndo: () => {
              toggleMutation.mutate({ buyer_ids: buyerIds, enabled: !enabled });
            },
          });
          clearPendingToggles(buyerIds);
          onDone?.();
        },
        onError: () => {
          clearPendingToggles(buyerIds);
        },
      },
    );
  }, [clearPendingToggles, toggleMutation]);

  const requestAccessChange = useCallback((buyerIds: string[], enabled: boolean, onDone?: () => void) => {
    const targetIds = buyerIds.filter((id) => {
      const buyer = buyerById.get(id);
      if (!buyer) return false;
      return enabled ? !buyer.buyer_app_enabled : buyer.buyer_app_enabled;
    });

    if (targetIds.length === 0) return;

    setPendingToggles((current) => {
      const next = { ...current };
      for (const buyerId of targetIds) {
        next[buyerId] = enabled;
      }
      return next;
    });

    const skipConfirm = enabled
      ? isBuyerAppEnableConfirmSkipped()
      : isBuyerAppDisableConfirmSkipped();

    if (skipConfirm) {
      applyAccessChange(targetIds, enabled, onDone);
      return;
    }

    const singleBuyer = targetIds.length === 1 ? buyerById.get(targetIds[0]!) ?? null : null;
    setConfirmDialog({
      open: true,
      mode: enabled ? 'enable' : 'disable',
      buyerIds: targetIds,
      singleBuyerLabel: singleBuyer ? resolveBuyerLabel(singleBuyer) : null,
    });
    pendingOnDoneRef.current = onDone ?? null;
  }, [applyAccessChange, buyerById]);

  function handleConfirmAccessChange(skipConfirm: boolean) {
    const { buyerIds, mode } = confirmDialog;
    if (skipConfirm) {
      if (mode === 'enable') {
        setBuyerAppEnableConfirmSkipped();
      } else {
        setBuyerAppDisableConfirmSkipped();
      }
    }

    applyAccessChange(buyerIds, mode === 'enable', () => {
      pendingOnDoneRef.current?.();
      pendingOnDoneRef.current = null;
      setSelectedIds([]);
    });
    setConfirmDialog((current) => ({ ...current, open: false }));
  }

  function handleFilterChange(updates: Partial<AccessFilter>) {
    setFilter((prev) => ({ ...prev, ...updates }));
    setSelectedIds([]);
  }

  const filterBarGroups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'enabled', label: 'Enabled' },
        { value: 'disabled', label: 'Not enabled' },
        { value: 'inactive', label: 'Inactive' },
      ],
      values: filter.status,
      onChange: (values) => handleFilterChange({ status: values }),
    },
    {
      key: 'suggested',
      label: 'Suggested',
      options: [{ value: 'suggested', label: 'Suggested only' }],
      values: filter.suggested,
      onChange: (values) => handleFilterChange({ suggested: values }),
    },
    {
      key: 'last_ordered',
      label: 'Last ordered',
      options: [
        { value: '30d', label: 'Last 30 days' },
        { value: '90d', label: 'Last 90 days' },
        { value: 'dormant', label: 'Dormant 90+' },
      ],
      values: filter.last_ordered,
      onChange: (values) => handleFilterChange({ last_ordered: values }),
    },
  ];

  if (isLoading && !data) return <ManageAccessSkeleton />;

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load access data"
        description="There was a problem fetching buyer app access data. Please try again."
      />
    );
  }

  return (
    <PageWrap className="pt-7">
      {/* Breadcrumb + title */}
      <header>
        <nav className="mb-4 flex items-center gap-1.5 text-sm text-cream-600">
          <Link href="/buyer-app" className="hover:text-cream-900">
            Buyer App
          </Link>
          <span className="text-cream-400">›</span>
          <span className="font-medium text-cream-900">Manage Access</span>
        </nav>
        <h1 className="font-display text-lg md:text-xl font-extrabold tracking-[-0.025em] text-cream-950">
          Manage Access
        </h1>
        <p className="mt-1 text-sm text-cream-600">
          Select buyers to enable or disable access to the buyer app. Changes apply immediately.
        </p>
      </header>

      {/* KPI strip */}
      {authoritativeKpis ? (
        <AccessKpiStrip
          kpis={authoritativeKpis}
          filter={filter}
          onFilterChange={(next) => {
            setFilter(next);
            setSelectedIds([]);
          }}
        />
      ) : null}

      {/* Bulk toolbar — above filter+table block */}
      {selectedIds.length > 0 ? (
        <BulkActionBar
          selectedCount={selectedIds.length}
          isPending={toggleMutation.isPending}
          onEnable={() => requestAccessChange(selectedIds, true, () => setSelectedIds([]))}
          onDisable={() => requestAccessChange(selectedIds, false, () => setSelectedIds([]))}
          onClear={() => setSelectedIds([])}
        />
      ) : null}

      {/* FilterBar + Table — visually connected as one block */}
      <FilterBar
        count={`Showing ${filteredBuyers.length} of ${latestPage?.filtered_count ?? filteredBuyers.length}`}
        searchPlaceholder="Search buyer, city…"
        chips={[]}
        activeChip=""
        sortBy={filter.sortBy}
        hideViewToggle
        groups={filterBarGroups}
        searchValue={filter.search}
        onSearchChange={(value) => handleFilterChange({ search: value })}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => handleFilterChange({ sortBy: option })}
      />

      <AccessTable
        buyers={filteredBuyers}
        selectedIds={selectedIds}
        pendingToggles={pendingToggles}
        onSelectionChange={setSelectedIds}
        onToggle={(buyerId, enabled) => requestAccessChange([buyerId], enabled)}
      />

      <BuyerAppAccessConfirmDialog
        open={confirmDialog.open}
        mode={confirmDialog.mode}
        selectedCount={confirmDialog.buyerIds.length}
        singleBuyerLabel={confirmDialog.singleBuyerLabel}
        preview={enablePreviewQuery.data ?? null}
        previewLoading={confirmDialog.mode === 'enable' && enablePreviewQuery.isLoading}
        previewError={
          confirmDialog.mode === 'enable' && enablePreviewQuery.isError
            ? (enablePreviewQuery.error instanceof Error
              ? enablePreviewQuery.error.message
              : 'Failed to load preview')
            : null
        }
        isPending={toggleMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            clearPendingToggles(confirmDialog.buyerIds);
            setConfirmDialog((current) => ({ ...current, open: false }));
            pendingOnDoneRef.current = null;
          }
        }}
        onConfirm={handleConfirmAccessChange}
      />

      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={isPlaceholderData || isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isPlaceholderData || isFetchingNextPage ? 'Loading buyers…' : 'Load more buyers'}
          </Button>
        </div>
      ) : null}
    </PageWrap>
  );
}

export function ManageAccessClient({ initialData }: { initialData: AccessPageResponse | null }) {
  return (
    <FeatureGate flag="BUYER_APP">
      <ManageAccessContent initialData={initialData} />
    </FeatureGate>
  );
}
