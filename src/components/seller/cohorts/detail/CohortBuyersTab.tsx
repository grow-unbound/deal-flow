'use client';

import { useEffect, useMemo, useState } from 'react';
import { FilterBar, LandingTable, type FilterBarGroup } from '@/components/seller/layout';
import {
  MemberToggle,
  MembershipBulkActionBar,
  RowSelectCheckbox,
  SelectableRow,
  SelectAllCheckbox,
  TableBodySkeleton,
  useSelectableRows,
} from '@/components/seller/shared/SelectableMembershipTable';
import type { CohortRulesSummary } from '@/lib/cohort-rules-summary';
import { useDebounce } from '@/hooks/useDebounce';
import { detailRowsTotal, flattenDetailRows, useCohortBuyersDetail } from '@/hooks/useDetailTabSearch';
import { formatDate, formatNumberValue } from '@/lib/utils';

type SortOption =
  | 'Spend 90D (high → low)'
  | 'Invoices 90D (high → low)'
  | 'Orders 90D (high → low)'
  | 'Estimates 90D (high → low)'
  | 'Buyer name (A → Z)'
  | 'Last invoice (recent first)';

const MEMBER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'all', label: 'All' },
];

const LAST_SALE_OPTIONS = [
  { value: 'within_30_days', label: 'Last 30d' },
  { value: 'within_90_days', label: 'Last 90d' },
  { value: 'dormant_90_plus_days', label: 'Dormant 90d+' },
  { value: 'never_ordered', label: 'Never ordered' },
];

const SALES_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

const BUYER_APP_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'not_enabled', label: 'Not enabled' },
  { value: 'inactive', label: 'Inactive' },
];

interface CohortBuyersTabProps {
  cohortId: string;
  rules_summary: CohortRulesSummary;
  activeMembersMtd: number;
}

function buyerAppLabel(status: string) {
  if (status === 'enabled') return 'Buyer App enabled';
  if (status === 'inactive') return 'Buyer inactive';
  return 'Buyer App not enabled';
}

function demandLabel(kind: 'orders' | 'estimates' | 'none' | string) {
  if (kind === 'orders') return 'Orders';
  if (kind === 'estimates') return 'Estimates';
  return 'Demand';
}

function demandSingularLabel(kind: 'orders' | 'estimates' | 'none' | string) {
  if (kind === 'orders') return 'Order';
  if (kind === 'estimates') return 'Estimate';
  return 'Demand';
}

function demandCountLabel(kind: 'orders' | 'estimates' | 'none' | string, count: number) {
  const label = kind === 'orders' ? 'orders' : kind === 'estimates' ? 'estimates' : 'docs';
  return `${formatNumberValue(count, 'COUNT')} ${label}`;
}

export function CohortBuyersTab({ cohortId, rules_summary, activeMembersMtd }: CohortBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('yes');
  const [lastSale, setLastSale] = useState<string[]>([]);
  const [sales90d, setSales90d] = useState<string[]>([]);
  const [buyerApp, setBuyerApp] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('Spend 90D (high → low)');

  const debouncedSearch = useDebounce(search, 300);
  const sort = sortBy === 'Invoices 90D (high → low)' ? 'invoices_desc' : sortBy === 'Orders 90D (high → low)' || sortBy === 'Estimates 90D (high → low)' ? 'demand_desc' : sortBy === 'Buyer name (A → Z)' ? 'name_asc' : sortBy === 'Last invoice (recent first)' ? 'last_invoice_desc' : 'spend_desc';
  const result = useCohortBuyersDetail(cohortId, {
    query: debouncedSearch,
    sort,
    params: { member, last_sale: lastSale, sales_90d: sales90d, buyer_app: buyerApp },
  });
  const buyers = useMemo(() => flattenDetailRows(result.data), [result.data]);
  const primaryDemandKind = buyers.find((buyer) => buyer.primary_demand_kind !== 'none')?.primary_demand_kind ?? buyers[0]?.primary_demand_kind ?? 'none';
  const primaryDemandLabel = demandLabel(primaryDemandKind);
  const selection = useSelectableRows(buyers, (buyer) => buyer.buyer_id);
  const isInitialLoading = !result.data && result.isLoading;
  const isInterim = search.trim() !== debouncedSearch.trim() || result.isFetching;

  useEffect(() => {
    selection.clearSelection();
  }, [member, lastSale, sales90d, buyerApp, debouncedSearch, sort, selection.clearSelection]);

  const filterGroups: FilterBarGroup[] = [
    { key: 'member', label: 'Member', options: MEMBER_OPTIONS, values: [member], onChange: (values) => setMember(values.at(-1) ?? 'all') },
    { key: 'last-sale', label: 'Last sale', options: LAST_SALE_OPTIONS, values: lastSale, onChange: setLastSale },
    { key: 'sales-90d', label: 'Sales 90d', options: SALES_OPTIONS, values: sales90d, onChange: setSales90d },
    { key: 'buyer-app', label: 'Buyer App', options: BUYER_APP_OPTIONS, values: buyerApp, onChange: setBuyerApp },
  ];

  const rulesTitle = rules_summary.is_static ? 'Manual member list' : 'Filters applied';
  const rulesSub = rules_summary.is_static
    ? `${rules_summary.matched_of_total_label}. Buyers are explicitly assigned to this customer group.`
    : `${rules_summary.member_count} buyers match · ${rules_summary.matched_of_total_label}.`;
  const hasFilters = rules_summary.filters.length > 0;

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">{rulesTitle}</h3>
            <p className="mt-1 text-base text-cream-700">{rulesSub}</p>
          </div>
          <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">Active this month</p>
            <p className="mt-1 font-display text-2xl leading-none text-cream-950">{activeMembersMtd}</p>
          </div>
        </div>

        {rules_summary.is_static ? (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            This is a targeted customer group. Membership is managed manually; rule filters do not apply.
          </div>
        ) : hasFilters ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {rules_summary.filters.map((row: CohortRulesSummary['filters'][number], idx: number) => (
              <div key={`${row.label}-${idx}`} className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">{row.label}</p>
                <p className="mt-1 text-base text-cream-900">{row.value_text}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            No saved filters. This customer group uses its manually curated member list only.
          </div>
        )}

        <div className="mt-3 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Allowed brands</p>
          <p className="mt-1 text-base text-cream-900">{rules_summary.allowed_brands_label}</p>
        </div>
      </article>

      <div>
        <MembershipBulkActionBar selectedCount={selection.selectedIds.length} onClear={selection.clearSelection} />
        <FilterBar
          count={`${detailRowsTotal(result.data)} buyers${isInterim ? ' · Updating' : ''}`}
          searchPlaceholder="Search buyer, contact, or geography…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          groups={filterGroups}
          searchValue={search}
          searchLoading={search.trim() !== debouncedSearch.trim()}
          onSearchChange={setSearch}
          sortOptions={[
            'Spend 90D (high → low)',
            'Invoices 90D (high → low)',
            `${primaryDemandLabel} 90D (high → low)`,
            'Buyer name (A → Z)',
            'Last invoice (recent first)',
          ]}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: <SelectAllCheckbox checked={selection.allSelected} indeterminate={selection.someSelected} onChange={selection.toggleVisible} />, width: 48, className: 'px-5' },
            { label: 'Buyer Name', width: 280, className: 'px-5' },
            { label: 'Member', width: 150, className: 'px-5' },
            { label: 'Geography', className: 'px-5' },
            { label: 'Spend · 90D', align: 'right', className: 'px-5' },
            { label: 'Last invoice', className: 'px-5' },
            { label: 'Outstanding due', align: 'right', className: 'px-5' },
            { label: `${primaryDemandLabel} · 90D`, align: 'right', className: 'px-5' },
            { label: `Last ${demandSingularLabel(primaryDemandKind)}`, className: 'px-5' },
          ]}
          tableMinWidth={1280}
          showEmptyState={!isInitialLoading && buyers.length === 0}
          emptyState={<div className="py-16 text-center text-sm text-cream-500">No buyers match these filters.</div>}
        >
          {isInitialLoading ? (
            <TableBodySkeleton columns={9} />
          ) : (
            buyers.map((buyer) => {
              const isSelected = selection.selectedIds.includes(buyer.buyer_id);
              return (
                <SelectableRow key={buyer.buyer_id} selected={isSelected}>
                  <td className="px-5 py-3.5"><RowSelectCheckbox checked={isSelected} onChange={() => selection.toggleRow(buyer.buyer_id)} /></td>
                  <td className="px-5 py-3.5">
                    <p className="truncate text-base font-medium text-cream-950">{buyer.business_name}</p>
                    <p className="mt-0.5 truncate text-xs text-cream-700">{buyerAppLabel(buyer.buyer_app_status)}</p>
                  </td>
                  <td className="px-5 py-3.5"><MemberToggle checked={buyer.is_member} label={`${buyer.business_name} membership`} /></td>
                  <td className="px-5 py-3.5 text-base text-cream-900">{buyer.geography_label}</td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-display text-md text-cream-950">{formatNumberValue(buyer.spend_90d, 'CURRENCY_EXACT')}</p>
                    <p className="mt-0.5 text-xs text-cream-600">{demandCountLabel('invoices', buyer.invoice_count_90d)}</p>
                  </td>
                  <td className="px-5 py-3.5 text-base text-cream-700">{buyer.last_invoice_at ? formatDate(buyer.last_invoice_at) : '—'}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{formatNumberValue(buyer.outstanding_due, 'CURRENCY_EXACT')}</td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-display text-md text-cream-950">{buyer.primary_demand_kind === 'none' ? '—' : formatNumberValue(buyer.demand_value_90d, 'CURRENCY_EXACT')}</p>
                    <p className="mt-0.5 text-xs text-cream-600">{buyer.primary_demand_kind === 'none' ? '—' : demandCountLabel(buyer.primary_demand_kind, buyer.demand_count_90d)}</p>
                  </td>
                  <td className="px-5 py-3.5 text-base text-cream-700">{buyer.last_primary_demand_at ? formatDate(buyer.last_primary_demand_at) : '—'}</td>
                </SelectableRow>
              );
            })
          )}
        </LandingTable>
        {result.hasNextPage ? <button type="button" className="mt-4 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium" disabled={result.isFetchingNextPage} onClick={() => result.fetchNextPage()}>{result.isFetchingNextPage ? 'Loading…' : 'Load more'}</button> : null}
      </div>
    </section>
  );
}
