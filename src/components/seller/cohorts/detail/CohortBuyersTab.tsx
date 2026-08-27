'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { FilterBar, LandingTable, type FilterBarGroup } from '@/components/seller/layout';
import { useDetailTableInfiniteScroll } from '@/hooks/useDetailTableInfiniteScroll';
import {
  MemberToggle,
  MembershipBulkActionBar,
  RowSelectCheckbox,
  SelectableRow,
  SelectAllCheckbox,
  TableBodySkeleton,
  useSelectableRows,
} from '@/components/seller/shared/SelectableMembershipTable';
import { AutomaticBuyerMembershipPanel } from '@/components/seller/shared/AutomaticMembershipRulesPanel';
import { BuyerAppAvatar } from '@/components/seller/shared/BuyerPickerRow';
import { Button } from '@/components/ui/button';
import type { CohortRulesSummary } from '@/lib/cohort-rules-summary';
import { useDebounce } from '@/hooks/useDebounce';
import { detailRowsTotal, flattenDetailRows, useCohortBuyersDetail } from '@/hooks/useDetailTabSearch';
import { useAddCohortMembers, useRemoveCohortMembers, useSaveSimpleCustomerGroup, type CohortDetailDetailsRules } from '@/hooks/useCohorts';
import type { BuyerMembershipRules } from '@/lib/zod';
import { formatDate, formatNumberValue } from '@/lib/utils';
import { toast } from 'sonner';

type SortOption =
  | 'Spend QTD (high → low)'
  | 'Invoices QTD (high → low)'
  | 'Orders QTD (high → low)'
  | 'Estimates QTD (high → low)'
  | 'Buyer name (A → Z)'
  | 'Last invoice (recent first)';

const MEMBER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'all', label: 'All' },
];

const DEMAND_THIS_QUARTER_OPTIONS = [
  { value: 'has_demand', label: 'Has demand' },
  { value: 'no_demand', label: 'No demand' },
];

const INVOICE_THIS_QUARTER_OPTIONS = [
  { value: 'purchased', label: 'Purchased' },
  { value: 'not_purchased', label: 'Not purchased' },
];

const BUYER_APP_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'not_enabled', label: 'Not enabled' },
  { value: 'inactive', label: 'Inactive' },
];

interface CohortBuyersTabProps {
  cohortId: string;
  rules_summary: CohortRulesSummary;
  details_rules: CohortDetailDetailsRules;
}

function initialsFromName(value: string) {
  return (
    value
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '—'
  );
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

function demandCountLabel(kind: 'orders' | 'estimates' | 'invoices' | 'none' | string, count: number) {
  const label = kind === 'orders' ? 'orders' : kind === 'estimates' ? 'estimates' : kind === 'invoices' ? 'invoices' : 'docs';
  return `${formatNumberValue(count, 'COUNT')} ${label}`;
}

export function CohortBuyersTab({ cohortId, rules_summary, details_rules }: CohortBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('yes');
  const [demandThisQuarter, setDemandThisQuarter] = useState<string[]>([]);
  const [invoiceThisQuarter, setInvoiceThisQuarter] = useState<string[]>([]);
  const [buyerApp, setBuyerApp] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('Spend QTD (high → low)');

  const debouncedSearch = useDebounce(search, 300);
  const sort = sortBy === 'Invoices QTD (high → low)' ? 'invoices_desc' : sortBy === 'Orders QTD (high → low)' || sortBy === 'Estimates QTD (high → low)' ? 'demand_desc' : sortBy === 'Buyer name (A → Z)' ? 'name_asc' : sortBy === 'Last invoice (recent first)' ? 'last_invoice_desc' : 'spend_desc';
  const result = useCohortBuyersDetail(cohortId, {
    query: debouncedSearch,
    sort,
    params: { member, demand_this_quarter: demandThisQuarter, invoice_this_quarter: invoiceThisQuarter, buyer_app: buyerApp },
  });
  const buyers = useMemo(() => flattenDetailRows(result.data), [result.data]);
  const primaryDemandKind = buyers.find((buyer) => buyer.primary_demand_kind !== 'none')?.primary_demand_kind ?? buyers[0]?.primary_demand_kind ?? 'none';
  const primaryDemandLabel = demandLabel(primaryDemandKind);
  const selection = useSelectableRows(buyers, (buyer) => buyer.buyer_id);
  const isInitialLoading = !result.data && result.isLoading;
  const isInterim = search.trim() !== debouncedSearch.trim() || result.isFetching;
  const { sentinelIndex, sentinelRef } = useDetailTableInfiniteScroll({
    itemCount: buyers.length,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    fetchNextPage: () => result.fetchNextPage(),
  });

  // Manual membership can be edited inline here; automatic membership's rules stay
  // Edit-overlay-only (requirement 6) -- this tab only adds/removes explicit picks.
  const addMembers = useAddCohortMembers(cohortId);
  const removeMembers = useRemoveCohortMembers(cohortId);
  const canEditMembership = rules_summary.is_static;
  const automaticMembershipTooltip =
    'This customer-group gets automatic membership based on the above filter criteria. Update filters to manage membership';

  // Automatic-mode rule editing lives here (requirement 5); mode switching itself stays
  // Edit-overlay-only (requirement 6). The `rules` column holds the new fixed-bucket
  // BuyerMembershipRules shape once saved via the simple form -- not the legacy field/
  // operator/value shape `details_rules.rules` is typed for, hence the cast.
  const savedRules = (details_rules.rules as unknown as BuyerMembershipRules) ?? {};
  const [draftRules, setDraftRules] = useState<BuyerMembershipRules>(savedRules);
  useEffect(() => {
    setDraftRules(savedRules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, details_rules.updated_at]);
  const saveGroup = useSaveSimpleCustomerGroup(cohortId);
  const rulesDirty = JSON.stringify(draftRules) !== JSON.stringify(savedRules);

  useEffect(() => {
    selection.clearSelection();
  }, [member, demandThisQuarter, invoiceThisQuarter, buyerApp, debouncedSearch, sort, selection.clearSelection]);

  const filterGroups: FilterBarGroup[] = [
    { key: 'member', label: 'Member', options: MEMBER_OPTIONS, values: [member], onChange: (values) => setMember(values.at(-1) ?? 'all') },
    { key: 'demand-this-quarter', label: 'Demand QTD', options: DEMAND_THIS_QUARTER_OPTIONS, values: demandThisQuarter, onChange: setDemandThisQuarter },
    { key: 'invoice-this-quarter', label: 'Invoices QTD', options: INVOICE_THIS_QUARTER_OPTIONS, values: invoiceThisQuarter, onChange: setInvoiceThisQuarter },
    { key: 'buyer-app', label: 'Buyer App', options: BUYER_APP_OPTIONS, values: buyerApp, onChange: setBuyerApp },
  ];

  const rulesTitle = rules_summary.is_static ? 'Manual member list' : 'Filters applied';
  const rulesSub = rules_summary.is_static
    ? `${rules_summary.matched_of_total_label}. Buyers are explicitly assigned to this customer group.`
    : `${rules_summary.member_count} buyers match.`;

  return (
    <section className="h-full max-h-[calc(100dvh-var(--topbar-h)-14rem)] space-y-4 overflow-y-auto pt-5">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div>
          <h3 className="font-display text-lg text-cream-950">{rulesTitle}</h3>
          <p className="mt-1 text-base text-cream-700">{rulesSub}</p>
        </div>

        {rules_summary.is_static ? (
          <div className="mt-4 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-base text-cream-700">
            This is a targeted customer group. Membership is managed manually; rule filters do not apply.
          </div>
        ) : (
          <div className="mt-4 space-y-3 rounded-[10px] border border-cream-300 bg-cream-50 p-3">
            <AutomaticBuyerMembershipPanel rules={draftRules} onRulesChange={(next) => setDraftRules(next)} />
            <div className="flex items-center justify-end gap-2">
              {rulesDirty ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraftRules(savedRules)} disabled={saveGroup.isPending}>
                  Discard
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={!rulesDirty || saveGroup.isPending}
                onClick={() =>
                  saveGroup.mutate({
                    form_mode: 'simple',
                    name: details_rules.name,
                    description: details_rules.description,
                    allowed_tenant_brand_ids: details_rules.allowed_tenant_brand_ids ?? [],
                    membership_mode: 'automatic',
                    selected_buyer_ids: [],
                    rules: draftRules,
                  })
                }
              >
                {saveGroup.isPending ? 'Saving…' : 'Save filters'}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Allowed brands</p>
          <p className="mt-1 text-base text-cream-900">{rules_summary.allowed_brands_label}</p>
        </div>
      </article>

      <div>
        <MembershipBulkActionBar
          selectedCount={selection.selectedIds.length}
          onClear={selection.clearSelection}
          isPending={addMembers.isPending || removeMembers.isPending}
          onInclude={() => {
            if (!canEditMembership) {
              toast.info('This group is Automatic — edit its filters from Edit instead of picking buyers here.');
              return;
            }
            addMembers.mutate(selection.selectedIds, { onSuccess: () => selection.clearSelection() });
          }}
          onRemove={() => {
            if (!canEditMembership) {
              toast.info('This group is Automatic — edit its filters from Edit instead of picking buyers here.');
              return;
            }
            removeMembers.mutate(selection.selectedIds, { onSuccess: () => selection.clearSelection() });
          }}
        />
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
            'Spend QTD (high → low)',
            'Invoices QTD (high → low)',
            `${primaryDemandLabel} QTD (high → low)`,
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
            { label: 'Spend · QTD', align: 'right', className: 'px-5' },
            { label: 'Last invoice', align: 'right', className: 'px-5' },
            { label: 'Outstanding due', align: 'right', className: 'px-5' },
            { label: `${primaryDemandLabel} · QTD`, align: 'right', className: 'px-5' },
            { label: `Last ${demandSingularLabel(primaryDemandKind)}`, align: 'right', className: 'px-5' },
          ]}
          tableMinWidth={1280}
          horizontalScrollOnly
          showEmptyState={!isInitialLoading && buyers.length === 0}
          emptyState={<div className="py-16 text-center text-sm text-cream-500">No buyers match these filters.</div>}
        >
          {isInitialLoading ? (
            <TableBodySkeleton columns={9} />
          ) : (
            buyers.map((buyer, index) => {
              const isSelected = selection.selectedIds.includes(buyer.buyer_id);
              return (
                <Fragment key={buyer.buyer_id}>
                {index === sentinelIndex ? (
                  <tr aria-hidden="true" style={{ height: 0 }}>
                    <td colSpan={9} className="p-0">
                      <div ref={sentinelRef} />
                    </td>
                  </tr>
                ) : null}
                <SelectableRow selected={isSelected}>
                  <td className="px-3 py-3"><RowSelectCheckbox checked={isSelected} onChange={() => selection.toggleRow(buyer.buyer_id)} /></td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <BuyerAppAvatar
                        initials={initialsFromName(buyer.business_name)}
                        enabled={buyer.buyer_app_status === 'enabled'}
                        size={38}
                      />
                      <p className="truncate text-base font-medium text-cream-950">{buyer.business_name}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <MemberToggle
                      checked={buyer.is_member}
                      label={`${buyer.business_name} membership`}
                      disabled={!canEditMembership}
                      disabledReason={!canEditMembership ? automaticMembershipTooltip : undefined}
                      isPending={addMembers.isPending || removeMembers.isPending}
                      onChange={(next) => {
                        if (next) addMembers.mutate([buyer.buyer_id]);
                        else removeMembers.mutate([buyer.buyer_id]);
                      }}
                    />
                  </td>
                  <td className="px-3 py-3 text-base text-cream-900">{buyer.geography_label}</td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-display text-md text-cream-950">{formatNumberValue(buyer.spend_90d, 'CURRENCY_EXACT')}</p>
                    <p className="mt-0.5 text-xs text-cream-600">{demandCountLabel('invoices', buyer.invoice_count_90d)}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-base text-cream-700">{buyer.last_invoice_at ? formatDate(buyer.last_invoice_at) : '—'}</td>
                  <td className="px-3 py-3 text-right font-mono text-base text-cream-900">{formatNumberValue(buyer.outstanding_due, 'CURRENCY_EXACT')}</td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-display text-md text-cream-950">{buyer.primary_demand_kind === 'none' ? '—' : formatNumberValue(buyer.demand_value_90d, 'CURRENCY_EXACT')}</p>
                    <p className="mt-0.5 text-xs text-cream-600">{buyer.primary_demand_kind === 'none' ? '—' : demandCountLabel(buyer.primary_demand_kind, buyer.demand_count_90d)}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-base text-cream-700">{buyer.last_primary_demand_at ? formatDate(buyer.last_primary_demand_at) : '—'}</td>
                </SelectableRow>
                </Fragment>
              );
            })
          )}
        </LandingTable>
      </div>
    </section>
  );
}
