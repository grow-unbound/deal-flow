'use client';

import { useEffect, useMemo, useState } from 'react';
import { FilterBar } from '@/components/seller/layout';
import { formatCompactInr } from '@/lib/utils';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { TransactionTable, type TransactionTableKind } from '@/components/seller/transactional';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/hooks/useDebounce';
import { useCustomerDocuments } from '@/hooks/useCustomersLanding';

interface CustomerOrdersTabProps {
  buyerId: string;
  kind?: TransactionTableKind;
  orders: Array<{
    id: string;
    order_number?: string | null;
    number?: string | null;
    estimate_number?: string | null;
    invoice_number?: string | null;
    buyer_name?: string | null;
    placed_at?: string | null;
    issued_at?: string | null;
    created_at?: string | null;
    expires_at?: string | null;
    due_date?: string | null;
    location_name?: string | null;
    place_of_supply?: string | null;
    source_kind?: 'buyer_app' | 'converted' | 'direct' | 'seller';
    source_label?: string | null;
    campaign_name?: string | null;
    items?: number;
    items_count?: number;
    gmv?: number;
    total_amount?: number;
    outstanding_amount?: number;
    status: string;
  }>;
  title?: string;
  description?: string;
  routeBase?: string;
}

type SortOption = 'Newest first' | 'Oldest first' | 'Amount (high → low)' | 'Amount (low → high)' | 'Status (A → Z)';

function getChips(kind: TransactionTableKind) {
  if (kind === 'estimate') {
    return ['All estimates', 'Draft', 'Sent', 'Accepted', 'Converted', 'Declined', 'Expired'];
  }
  if (kind === 'invoice') {
    return ['All invoices', 'Draft', 'Sent', 'Paid', 'Overdue', 'Void'];
  }
  return ['All orders', 'Received', 'Confirmed', 'In transit', 'Delivered', 'Cancelled'];
}

function getSortOptions(kind: TransactionTableKind): SortOption[] {
  if (kind === 'estimate') {
    return ['Newest first', 'Oldest first', 'Amount (high → low)', 'Amount (low → high)', 'Status (A → Z)'];
  }
  if (kind === 'invoice') {
    return ['Newest first', 'Oldest first', 'Amount (high → low)', 'Amount (low → high)', 'Status (A → Z)'];
  }
  return ['Newest first', 'Oldest first', 'Amount (high → low)', 'Amount (low → high)', 'Status (A → Z)'];
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
    if (status === 'declined' || status === 'expired' || status === 'void') return 'danger';
    if (status === 'draft') return 'neutral';
    return 'warning';
  }
  if (status === 'paid') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'void') return 'neutral';
  if (status === 'draft') return 'neutral';
  return 'warning';
}

function titleCase(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function CustomerOrdersTab({
  buyerId,
  kind = 'order',
  orders,
  title = 'Orders',
  description = 'All orders placed by this buyer',
  routeBase = '/sales-orders',
}: CustomerOrdersTabProps) {
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState(getChips(kind)[0]);
  const [sortBy, setSortBy] = useState<SortOption>('Newest first');
  const [page, setPage] = useState(0);

  const chips = useMemo(() => getChips(kind), [kind]);
  const sortOptions = useMemo(() => getSortOptions(kind), [kind]);
  const debouncedSearch = useDebounce(search, 300);
  const status = activeChip === chips[0] ? undefined : activeChip === 'In transit' ? 'in_transit' : activeChip.toLowerCase();
  const sortValues: Record<SortOption, string> = {
    'Newest first': 'newest',
    'Oldest first': 'oldest',
    'Amount (high → low)': 'amount_desc',
    'Amount (low → high)': 'amount_asc',
    'Status (A → Z)': 'status_asc',
  };
  const documentsQuery = useCustomerDocuments(buyerId, { kind, query: debouncedSearch, status, sort: sortValues[sortBy], page });

  useEffect(() => {
    setActiveChip(chips[0]);
    setSortBy('Newest first');
  }, [chips, kind]);
  useEffect(() => setPage(0), [debouncedSearch, sortBy, status]);

  const authoritativeOrders: CustomerOrdersTabProps['orders'] = documentsQuery.data
    ? documentsQuery.data.rows.map((row) => ({
        ...row,
        issued_at: row.placed_at,
        items: row.items_count,
        gmv: row.total_amount,
      }))
    : orders;
  const isTransitioning = documentsQuery.isFetching || search !== debouncedSearch;

  const filteredOrders = useMemo(() => {
    if (!isTransitioning) return authoritativeOrders;
    const query = search.trim().toLowerCase();
    const rowTime = (row: (typeof authoritativeOrders)[number]) =>
      new Date(row.created_at ?? row.issued_at ?? row.placed_at ?? 0).getTime();
    const documentNumber = (row: (typeof authoritativeOrders)[number]) =>
      row.order_number ?? row.number ?? row.estimate_number ?? row.invoice_number ?? row.id.slice(0, 8);

    return authoritativeOrders
      .filter((row) => {
        const label = titleCase(row.status);
        if (activeChip === chips[0]) return true;
        if (kind === 'order') {
          if (activeChip === 'In transit') return ['dispatched', 'partially_dispatched'].includes(row.status);
          if (activeChip === 'Cancelled') return row.status === 'cancelled';
          return label === activeChip || row.status === activeChip.toLowerCase();
        }
        if (kind === 'estimate') {
          if (activeChip === 'Draft') return row.status === 'draft';
          if (activeChip === 'Sent') return row.status === 'sent';
          if (activeChip === 'Accepted') return row.status === 'accepted';
          if (activeChip === 'Converted') return row.status === 'converted';
          if (activeChip === 'Declined') return row.status === 'declined';
          if (activeChip === 'Expired') return row.status === 'expired';
          return true;
        }
        if (activeChip === 'Draft') return row.status === 'draft';
        if (activeChip === 'Sent') return row.status === 'sent';
        if (activeChip === 'Paid') return row.status === 'paid';
        if (activeChip === 'Overdue') return row.status === 'overdue';
        if (activeChip === 'Void') return row.status === 'void';
        return true;
      })
      .filter((row) => {
        if (!query) return true;
        return [
          documentNumber(row),
          row.buyer_name,
          row.location_name,
          row.campaign_name,
          row.source_label,
          titleCase(row.status),
        ]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (sortBy === 'Newest first') return rowTime(b) - rowTime(a);
        if (sortBy === 'Oldest first') return rowTime(a) - rowTime(b);
        if (sortBy === 'Amount (high → low)') return Number(b.total_amount ?? 0) - Number(a.total_amount ?? 0);
        if (sortBy === 'Amount (low → high)') return Number(a.total_amount ?? 0) - Number(b.total_amount ?? 0);
        return titleCase(a.status).localeCompare(titleCase(b.status)) || documentNumber(a).localeCompare(documentNumber(b));
      });
  }, [activeChip, authoritativeOrders, chips, isTransitioning, kind, search, sortBy]);
  const total = documentsQuery.data?.total ?? orders.length;

  return (
    <section className="mt-5 space-y-4">
      <FilterBar
        count={`${filteredOrders.length} of ${total} ${title.toLowerCase()}${isTransitioning ? ' · Updating' : ''}`}
        searchPlaceholder={`Search ${title.toLowerCase().slice(0, -1)} number…`}
        chips={chips}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={setActiveChip}
        sortOptions={sortOptions}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />

      {filteredOrders.length === 0 ? (
        <div className="rounded-[14px] border border-cream-300 bg-white py-12 text-center text-sm text-cream-500">
          No {title.toLowerCase()} found for this buyer.
        </div>
      ) : (
        <TransactionTable
          kind={kind}
          showCampaignColumn={showCampaignColumn}
          className="rounded-none border-0"
          tableMinWidth={showCampaignColumn ? (kind === 'invoice' ? 1480 : kind === 'estimate' ? 1450 : 1380) : kind === 'invoice' ? 1260 : kind === 'estimate' ? 1230 : 1180}
          rows={filteredOrders.map((row) => {
            const documentNumber =
              row.order_number ?? row.number ?? row.estimate_number ?? row.invoice_number ?? row.id.slice(0, 8);
            const itemsCount = row.items_count ?? row.items ?? 0;
            const totalAmount = Number(row.total_amount ?? row.gmv ?? 0);
            const createdAt = row.created_at ?? row.issued_at ?? row.placed_at ?? null;
            return {
              id: row.id,
              href: `${routeBase}/${row.id}`,
              document_number: documentNumber,
              source_kind: row.source_kind ?? (kind === 'estimate' ? 'seller' : 'direct'),
              source_label: row.source_label ?? null,
              buyer_name: row.buyer_name ?? 'Buyer',
              buyer_place_of_supply: row.place_of_supply ?? null,
              buyer_initials: null,
              buyer_hue: null,
              location_name: row.location_name ?? null,
              campaign_name: row.campaign_name ?? null,
              items_count: itemsCount,
              total_amount: totalAmount,
              amount_subtext:
                kind === 'invoice' && Number(row.outstanding_amount ?? 0) > 0
                  ? `${formatCompactInr(Number(row.outstanding_amount))} due`
                  : null,
              status_label: titleCase(row.status),
              status_tone: statusTone(kind, row.status),
              created_at: createdAt,
              expires_at: row.expires_at ?? null,
              due_at: row.due_date ?? null,
            };
          })}
        />
      )}
      {total > 50 ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || documentsQuery.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= total || documentsQuery.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      ) : null}
    </section>
  );
}
