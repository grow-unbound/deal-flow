'use client';

import { useMemo } from 'react';
import { FileText, Package, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FilterBar, type FilterBarGroup } from '@/components/seller/layout';
import { TransactionTable, type TransactionTableKind, type TransactionTableRow } from '@/components/seller/transactional';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useLocationDocuments } from '@/hooks/useLocations';
import type { LocationDocumentRow } from '@/hooks/useLocations';
import { useDebounce } from '@/hooks/useDebounce';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import type { SellerLandingPeriod } from '@/lib/seller-period';

interface LocationOrdersTabProps {
  locationId: string;
  kind?: TransactionTableKind;
  routeBase?: string;
}

type SortOption =
  | 'Recent first'
  | 'Value (high → low)'
  | 'Status (workflow order)'
  | 'Expiry (soonest first)'
  | 'Order value (high → low)'
  | 'Items (high → low)'
  | 'Outstanding (high → low)';

const ESTIMATE_SORT_OPTIONS: SortOption[] = ['Recent first', 'Value (high → low)', 'Status (workflow order)', 'Expiry (soonest first)'];
const ORDER_SORT_OPTIONS: SortOption[] = ['Recent first', 'Order value (high → low)', 'Items (high → low)'];
const INVOICE_SORT_OPTIONS: SortOption[] = ['Recent first', 'Value (high → low)', 'Outstanding (high → low)'];

const ESTIMATE_STATUS_RANK: Record<string, number> = {
  draft: 0, sent: 1, accepted: 2, declined: 3, expired: 4, converted: 5, invoiced: 6, void: 7, pending: 8,
};

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(kind: TransactionTableKind, status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (kind === 'order') {
    if (['confirmed', 'dispatched', 'delivered', 'invoiced', 'partially_invoiced'].includes(status)) return 'success';
    if (status === 'cancelled') return 'danger';
    if (status === 'draft') return 'neutral';
    return 'warning';
  }
  if (kind === 'estimate') {
    if (['accepted', 'converted', 'invoiced'].includes(status)) return 'success';
    if (['declined', 'expired', 'void'].includes(status)) return 'danger';
    if (status === 'draft') return 'neutral';
    return 'warning';
  }
  if (status === 'paid') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'void' || status === 'draft') return 'neutral';
  return 'warning';
}

function estimateStatusChip(status: string) {
  if (status === 'sent') return 'Sent';
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  if (status === 'expired') return 'Expired';
  if (status === 'converted') return 'Converted';
  return titleCase(status);
}

function orderStatusChip(status: string) {
  if (status === 'received') return 'Received';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'dispatched' || status === 'partially_dispatched') return 'In transit';
  if (status === 'invoiced' || status === 'partially_invoiced') return 'Invoiced';
  if (status === 'delivered') return 'Delivered';
  if (status === 'cancelled') return 'Cancelled';
  return titleCase(status);
}

function invoiceStatusChip(status: string) {
  if (status === 'sent') return 'Sent';
  if (status === 'paid') return 'Paid';
  if (status === 'overdue') return 'Overdue';
  if (status === 'void') return 'Void';
  return titleCase(status);
}

function sourceLabel(kind: TransactionTableKind, row: LocationDocumentRow) {
  if (kind === 'estimate') return row.source_kind === 'buyer_app' ? 'Buyer App' : 'Direct';
  if (kind === 'order') {
    if (row.source_kind === 'converted') return 'Converted Estimate';
    if (row.source_kind === 'buyer_app') return 'Buyer App';
    return 'Direct';
  }
  if (row.source_kind === 'converted') return 'Converted';
  if (row.source_kind === 'buyer_app') return 'Buyer App';
  return 'Direct';
}

function searchPlaceholder(kind: TransactionTableKind) {
  if (kind === 'estimate') return 'Search estimate number…';
  if (kind === 'invoice') return 'Search invoice number…';
  return 'Search order number…';
}

function sortOptions(kind: TransactionTableKind) {
  if (kind === 'estimate') return ESTIMATE_SORT_OPTIONS;
  if (kind === 'invoice') return INVOICE_SORT_OPTIONS;
  return ORDER_SORT_OPTIONS;
}

function toMappedRow(kind: TransactionTableKind, routeBase: string, row: LocationDocumentRow): TransactionTableRow {
  return {
    id: row.id,
    href: `${routeBase}/${row.id}`,
    document_number: row.number ?? row.id.slice(0, 8),
    source_kind: row.source_kind,
    source_label: sourceLabel(kind, row),
    source_detail: row.source_label ?? null,
    buyer_name: row.buyer_name ?? '—',
    buyer_place_of_supply: row.place_of_supply ?? null,
    location_name: null,
    campaign_name: row.campaign_name ?? null,
    items_count: row.items_count,
    total_amount: row.total_amount,
    outstanding_amount: kind === 'invoice' ? row.outstanding_amount : null,
    amount_subtext: kind === 'invoice' && row.outstanding_amount > 0 ? 'Outstanding balance' : null,
    status_label: titleCase(row.status),
    status_tone: statusTone(kind, row.status),
    created_at: row.placed_at ?? row.created_at ?? null,
    expires_at: row.expires_at ?? null,
    due_at: row.due_date ?? null,
  };
}

export function LocationOrdersTab({
  locationId,
  kind = 'order',
  routeBase = '/sales-orders',
}: LocationOrdersTabProps) {
  const router = useRouter();
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: `seller-location-detail-${kind}-tab`,
    scopeKey: locationId,
    version: 1,
    initialState: {
      period: 'last90' as SellerLandingPeriod,
      search: '',
      filters: {
        source: [] as string[],
        status: [] as string[],
        due: [] as string[],
        buyer_name: [] as string[],
      },
      sortBy: sortOptions(kind)[0] as SortOption,
    },
  });
  const { period, setPeriod, options } = useSellerLandingPeriod(routeState.period);
  const search = routeState.search;
  const filters = routeState.filters;
  const sortBy = routeState.sortBy;
  const debouncedSearch = useDebounce(search, 300);
  const isInterim = search !== debouncedSearch;

  const querySort =
    kind === 'estimate'
      ? sortBy === 'Value (high → low)' ? 'amount_desc'
        : sortBy === 'Status (workflow order)' ? 'status_asc'
        : sortBy === 'Expiry (soonest first)' ? 'expiry_asc'
        : 'newest'
      : kind === 'invoice'
        ? sortBy === 'Value (high → low)' ? 'amount_desc'
          : sortBy === 'Outstanding (high → low)' ? 'outstanding_desc'
          : 'newest'
        : sortBy === 'Order value (high → low)' ? 'amount_desc'
          : sortBy === 'Items (high → low)' ? 'items_desc'
          : 'newest';

  const queryStatuses = useMemo(() => {
    if (filters.status.length === 0) return [];
    if (kind === 'order') {
      return filters.status.flatMap((value) => {
        if (value === 'In transit') return ['dispatched', 'partially_dispatched'];
        if (value === 'Invoiced') return ['invoiced', 'partially_invoiced'];
        return [value.toLowerCase()];
      });
    }
    return filters.status.map((value) => value.toLowerCase());
  }, [filters.status, kind]);

  const documentsQuery = useLocationDocuments(locationId, {
    kind,
    period: period as SellerLandingPeriod,
    query: debouncedSearch,
    status: queryStatuses,
    sort: querySort,
  });

  const allRows = useMemo(() => documentsQuery.data?.rows ?? [], [documentsQuery.data?.rows]);

  const rows = useMemo(() => {
    let nextRows = allRows.filter((row) => {
      const needle = search.trim().toLowerCase();
      if (needle) {
        const matches = [row.number, row.buyer_name, row.place_of_supply, sourceLabel(kind, row), row.source_label, row.campaign_name]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .some((v) => v.toLowerCase().includes(needle));
        if (!matches) return false;
      }
      if (filters.source.length > 0 && !filters.source.includes(sourceLabel(kind, row))) return false;
      const chip =
        kind === 'estimate' ? estimateStatusChip(row.status)
        : kind === 'order' ? orderStatusChip(row.status)
        : invoiceStatusChip(row.status);
      if (filters.status.length > 0 && !filters.status.includes(chip)) return false;
      if (filters.buyer_name.length > 0 && !filters.buyer_name.includes(row.buyer_name ?? '—')) return false;
      if (kind === 'invoice' && filters.due.length > 0) {
        const matchesDue = filters.due.some((v) => {
          if (v === 'Overdue') return row.status === 'overdue';
          if (v === 'Due') return row.outstanding_amount > 0 && row.status !== 'overdue';
          return false;
        });
        if (!matchesDue) return false;
      }
      return true;
    });

    nextRows = [...nextRows].sort((a, b) => {
      const aCreated = new Date(a.placed_at ?? a.created_at ?? 0).getTime();
      const bCreated = new Date(b.placed_at ?? b.created_at ?? 0).getTime();
      if (kind === 'estimate') {
        if (sortBy === 'Value (high → low)') return b.total_amount - a.total_amount;
        if (sortBy === 'Status (workflow order)') {
          const delta = (ESTIMATE_STATUS_RANK[a.status] ?? 999) - (ESTIMATE_STATUS_RANK[b.status] ?? 999);
          if (delta !== 0) return delta;
        }
        if (sortBy === 'Expiry (soonest first)') {
          const aExp = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
          const bExp = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
          if (aExp !== bExp) return aExp - bExp;
        }
        return bCreated - aCreated;
      }
      if (kind === 'order') {
        if (sortBy === 'Order value (high → low)') return b.total_amount - a.total_amount;
        if (sortBy === 'Items (high → low)') return b.items_count - a.items_count;
        return bCreated - aCreated;
      }
      if (sortBy === 'Value (high → low)') return b.total_amount - a.total_amount;
      if (sortBy === 'Outstanding (high → low)') return b.outstanding_amount - a.outstanding_amount;
      return bCreated - aCreated;
    });

    return nextRows;
  }, [allRows, filters.buyer_name, filters.due, filters.source, filters.status, kind, search, sortBy]);

  const groups = useMemo<FilterBarGroup[]>(() => {
    const sourceOptions = Array.from(new Set(allRows.map((row) => sourceLabel(kind, row)))).map((v) => ({ value: v, label: v }));
    const statusOptions = Array.from(new Set(allRows.map((row) =>
      kind === 'estimate' ? estimateStatusChip(row.status)
      : kind === 'order' ? orderStatusChip(row.status)
      : invoiceStatusChip(row.status),
    ))).map((v) => ({ value: v, label: v }));
    const buyerOptions = Array.from(new Set(allRows.map((row) => row.buyer_name ?? '—'))).map((v) => ({ value: v, label: v }));

    const nextGroups: FilterBarGroup[] = [
      {
        key: 'period',
        label: 'Period',
        options,
        values: [period],
        onChange: (values) => {
          const nextPeriod = (values[0] as SellerLandingPeriod | undefined) ?? 'last90';
          setPeriod(nextPeriod);
          setRouteState((current) => ({ ...current, period: nextPeriod }));
        },
      },
      {
        key: 'source',
        label: 'Source',
        options: sourceOptions,
        values: filters.source,
        onChange: (values) => setRouteState((current) => ({ ...current, filters: { ...current.filters, source: values } })),
      },
      {
        key: 'status',
        label: 'Status',
        options: statusOptions,
        values: filters.status,
        onChange: (values) => setRouteState((current) => ({ ...current, filters: { ...current.filters, status: values } })),
      },
      {
        key: 'buyer_name',
        label: 'Customer',
        options: buyerOptions,
        values: filters.buyer_name,
        onChange: (values) => setRouteState((current) => ({ ...current, filters: { ...current.filters, buyer_name: values } })),
      },
    ];

    if (kind === 'invoice') {
      nextGroups.splice(3, 0, {
        key: 'due',
        label: 'Due',
        options: [{ value: 'Due', label: 'Due' }, { value: 'Overdue', label: 'Overdue' }],
        values: filters.due,
        onChange: (values) => setRouteState((current) => ({ ...current, filters: { ...current.filters, due: values } })),
      });
    }

    return nextGroups.filter((group) => group.key === 'period' || group.options.length > 0);
  }, [allRows, filters.buyer_name, filters.due, filters.source, filters.status, kind, options, period, setPeriod, setRouteState]);

  const tableRows = useMemo(
    () => rows.map((row) => toMappedRow(kind, routeBase, row)),
    [rows, kind, routeBase],
  );

  const loading = documentsQuery.isLoading && !documentsQuery.data;

  return (
    <section className="mt-5">
      <FilterBar
        count={`Showing ${tableRows.length} of ${documentsQuery.data?.total ?? 0}${(documentsQuery.isFetching || isInterim) ? ' · Updating' : ''}`}
        searchPlaceholder={searchPlaceholder(kind)}
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={groups}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={sortOptions(kind)}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />

      <div className="overflow-x-auto">
        {loading ? (
          <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
            <div className="h-[420px] animate-pulse bg-cream-50" />
          </div>
        ) : tableRows.length === 0 ? (
          <EmptyState
            icon={kind === 'estimate' ? <FileText size={28} strokeWidth={1.5} /> : kind === 'invoice' ? <Receipt size={28} strokeWidth={1.5} /> : <Package size={28} strokeWidth={1.5} />}
            heading={`No matching ${kind === 'order' ? 'sales orders' : `${kind}s`}`}
            description="Try a different search or filter combination."
          />
        ) : (
          <TransactionTable
            kind={kind}
            showCampaignColumn={showCampaignColumn}
            tableMinWidth={showCampaignColumn ? (kind === 'invoice' ? 1480 : kind === 'estimate' ? 1450 : 1380) : kind === 'invoice' ? 1260 : kind === 'estimate' ? 1230 : 1180}
            rows={tableRows}
            onRowClick={(row) => router.push(row.href)}
          />
        )}
      </div>

      {documentsQuery.isFetching && documentsQuery.data ? (
        <div className="mt-4 flex justify-center">
          <Skeleton className="h-8 w-40 rounded-full" />
        </div>
      ) : null}
    </section>
  );
}
