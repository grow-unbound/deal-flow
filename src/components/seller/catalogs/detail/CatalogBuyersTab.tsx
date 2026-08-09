'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FilterBar, LandingTable, StatusTag, type FilterBarGroup } from '@/components/seller/layout';
import { MembershipFilterPanel } from '@/components/seller/shared/MembershipFilterPanel';
import {
  MemberToggle,
  MembershipBulkActionBar,
  RowSelectCheckbox,
  SelectableRow,
  SelectAllCheckbox,
  TableBodySkeleton,
  useSelectableRows,
} from '@/components/seller/shared/SelectableMembershipTable';
import {
  useAddCampaignBuyers,
  useCatalogBuyers,
  useRemoveCampaignBuyers,
  useSaveSimpleCatalog,
  type CatalogDetailResponse,
} from '@/hooks/useCatalogs';
import { useDebounce } from '@/hooks/useDebounce';
import type { BuyerMembershipRules } from '@/lib/zod';
import { formatDate, formatNumberValue } from '@/lib/utils';

type SortOption =
  | 'Demand Value (high → low)'
  | 'Demand Count (high → low)'
  | 'Orders (high → low)'
  | 'Estimates (high → low)'
  | 'Order Count (high → low)'
  | 'Estimate Count (high → low)'
  | 'Recently opened'
  | 'Buyer name (A → Z)';
type CampaignBuyer = CatalogDetailResponse['buyers'][number];

interface CatalogBuyersTabProps {
  catalogId: string;
  buyers: CatalogDetailResponse['buyers'];
  selectedCohort: CatalogDetailResponse['header']['selected_cohort'];
  composer?: CatalogDetailResponse['composer'];
  headerName: string;
  heroImageUrl: string | null;
}

const MEMBER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'all', label: 'All' },
];

const STATUS_OPTIONS = [
  { value: 'NOT YET OPENED', label: 'NOT YET OPENED' },
  { value: 'OPENED', label: 'OPENED' },
  { value: 'CONVERTED', label: 'CONVERTED' },
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

const sortValue: Record<SortOption, string> = {
  'Demand Value (high → low)': 'gmv_desc',
  'Demand Count (high → low)': 'conversions_desc',
  'Orders (high → low)': 'gmv_desc',
  'Estimates (high → low)': 'gmv_desc',
  'Order Count (high → low)': 'conversions_desc',
  'Estimate Count (high → low)': 'conversions_desc',
  'Recently opened': 'recently_opened',
  'Buyer name (A → Z)': 'name_asc',
};

function normalizeStatus(status: CampaignBuyer['opened_status']): 'NOT YET OPENED' | 'OPENED' | 'CONVERTED' {
  if (status === 'Converted' || status === 'CONVERTED') return 'CONVERTED';
  if (status === 'Opened' || status === 'OPENED') return 'OPENED';
  return 'NOT YET OPENED';
}

function statusTone(status: CampaignBuyer['opened_status']) {
  const normalized = normalizeStatus(status);
  if (normalized === 'CONVERTED' || normalized === 'OPENED') return 'success';
  return 'warning';
}

function buyerAppLabel(status?: string) {
  if (status === 'enabled') return 'Buyer App enabled';
  if (status === 'inactive') return 'Buyer inactive';
  return 'Buyer App not enabled';
}

function demandLabel(kind: 'orders' | 'estimates' | 'none' | string | undefined) {
  if (kind === 'orders') return 'Orders';
  if (kind === 'estimates') return 'Estimates';
  return 'Demand';
}

function demandSingularLabel(kind: 'orders' | 'estimates' | 'none' | string | undefined) {
  if (kind === 'orders') return 'Order';
  if (kind === 'estimates') return 'Estimate';
  return 'Demand';
}

function demandCountLabel(kind: 'orders' | 'estimates' | 'none' | string | undefined, count: number) {
  const label = kind === 'orders' ? 'orders' : kind === 'estimates' ? 'estimates' : 'docs';
  return `${formatNumberValue(count, 'COUNT')} ${label}`;
}

export function CatalogBuyersTab({ catalogId, buyers, selectedCohort, composer, headerName, heroImageUrl }: CatalogBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('yes');
  const [status, setStatus] = useState<string[]>([]);
  const [demandThisQuarter, setDemandThisQuarter] = useState<string[]>([]);
  const [invoiceThisQuarter, setInvoiceThisQuarter] = useState<string[]>([]);
  const [buyerApp, setBuyerApp] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('Demand Value (high → low)');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);
  const query = useCatalogBuyers(catalogId, {
    query: debouncedSearch,
    member,
    status,
    demandThisQuarter,
    invoiceThisQuarter,
    buyerApp,
    sort: sortValue[sortBy],
    page,
  });

  useEffect(() => setPage(0), [debouncedSearch, sortBy, member, status, demandThisQuarter, invoiceThisQuarter, buyerApp]);

  const fallbackTotals = useMemo(() => ({
    opens: buyers.filter((buyer) => normalizeStatus(buyer.opened_status) !== 'NOT YET OPENED').length,
    converted: buyers.filter((buyer) => normalizeStatus(buyer.opened_status) === 'CONVERTED').length,
    gmv: buyers.reduce((sum, buyer) => sum + buyer.spend, 0),
  }), [buyers]);
  const totals = query.data?.totals ?? fallbackTotals;
  const rows = query.data?.rows ?? buyers;
  const primaryDemandKind = rows.find((buyer) => buyer.primary_demand_kind && buyer.primary_demand_kind !== 'none')?.primary_demand_kind ?? rows[0]?.primary_demand_kind ?? 'none';
  const primaryDemandLabel = demandLabel(primaryDemandKind);
  const selection = useSelectableRows(rows, (buyer) => buyer.buyer_id);
  const isInitialLoading = !query.data && query.isLoading;
  const isTransitioning = query.isFetching || search !== debouncedSearch;
  const total = query.data?.total ?? buyers.length;

  useEffect(() => {
    selection.clearSelection();
  }, [debouncedSearch, sortBy, member, status, demandThisQuarter, invoiceThisQuarter, buyerApp, selection.clearSelection]);

  const addBuyers = useAddCampaignBuyers(catalogId);
  const removeBuyers = useRemoveCampaignBuyers(catalogId);
  const buyerTargetMode = composer?.buyer_target_mode ?? 'manual';
  const canEditMembership = buyerTargetMode === 'manual';

  // Automatic-mode rule editing (requirement 5); "customer_group" targeting has no rules to
  // edit here -- that's a cohort pick, changed via Edit only.
  const savedBuyerRules = composer?.buyer_rules ?? {};
  const [draftBuyerRules, setDraftBuyerRules] = useState<BuyerMembershipRules>(savedBuyerRules);
  useEffect(() => {
    setDraftBuyerRules(savedBuyerRules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId, composer?.buyer_rules]);
  const saveCatalog = useSaveSimpleCatalog(catalogId);
  const buyerRulesDirty = JSON.stringify(draftBuyerRules) !== JSON.stringify(savedBuyerRules);

  function saveBuyerRules() {
    if (!composer) return;
    saveCatalog.mutate({
      form_mode: 'simple',
      name: headerName,
      description: composer.description ?? '',
      valid_from: new Date(composer.valid_from),
      valid_to: composer.valid_to ? new Date(composer.valid_to) : undefined,
      buyer_note: composer.message ?? '',
      hero_image_url: heroImageUrl ?? '',
      target_mode: 'individual_buyers',
      target_cohort_id: null,
      pricing_mode: composer.price_source === 'price_list' ? 'pricelist' : 'individual_prices',
      price_list_id: composer.price_source === 'price_list' ? composer.price_list_id : null,
      buyer_target_mode: 'automatic',
      buyer_ids: [],
      buyer_rules: draftBuyerRules,
      product_membership_mode: composer.product_membership_mode,
      selected_product_ids: composer.product_membership_mode === 'manual'
        ? composer.items.map((item) => item.tenant_product_id)
        : [],
      product_rules: composer.product_rules,
    });
  }

  const filterGroups: FilterBarGroup[] = [
    { key: 'member', label: 'Member', options: MEMBER_OPTIONS, values: [member], onChange: (values) => setMember(values.at(-1) ?? 'all') },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, values: status, onChange: setStatus },
    { key: 'demand-this-quarter', label: 'Demand QTD', options: DEMAND_THIS_QUARTER_OPTIONS, values: demandThisQuarter, onChange: setDemandThisQuarter },
    { key: 'invoice-this-quarter', label: 'Invoices QTD', options: INVOICE_THIS_QUARTER_OPTIONS, values: invoiceThisQuarter, onChange: setInvoiceThisQuarter },
    { key: 'buyer-app', label: 'Buyer App', options: BUYER_APP_OPTIONS, values: buyerApp, onChange: setBuyerApp },
  ];

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Selected cohort</h3>
            <p className="mt-1 text-base text-cream-900">{selectedCohort.display_label}</p>
            <p className="mt-1 text-base text-cream-700">
              {selectedCohort.member_count} buyers · scope {selectedCohort.scope_type === 'all' ? 'all buyers' : selectedCohort.scope_type}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-right">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">Opens</p>
              <p className="mt-1 font-display text-2xl leading-none text-cream-950">{totals.opens}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-right">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">Converted</p>
              <p className="mt-1 font-display text-2xl leading-none text-cream-950">{totals.converted}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3 text-right">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">Demand value</p>
              <p className="mt-1 font-display text-2xl leading-none text-cream-950">{formatNumberValue(totals.gmv, 'CURRENCY_THRESHOLD')}</p>
            </div>
          </div>
        </div>

        {buyerTargetMode === 'automatic' ? (
          <div className="mt-4 space-y-3 rounded-[10px] border border-cream-300 bg-cream-50 p-3">
            <MembershipFilterPanel entityType="campaign_buyers" rules={draftBuyerRules} onRulesChange={(next) => setDraftBuyerRules(next as BuyerMembershipRules)} />
            <div className="flex items-center justify-end gap-2">
              {buyerRulesDirty ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraftBuyerRules(savedBuyerRules)} disabled={saveCatalog.isPending}>
                  Discard
                </Button>
              ) : null}
              <Button type="button" size="sm" disabled={!buyerRulesDirty || saveCatalog.isPending} onClick={saveBuyerRules}>
                {saveCatalog.isPending ? 'Saving…' : 'Save filters'}
              </Button>
            </div>
          </div>
        ) : null}
      </article>

      <div>
        <MembershipBulkActionBar
          selectedCount={selection.selectedIds.length}
          onClear={selection.clearSelection}
          isPending={addBuyers.isPending || removeBuyers.isPending}
          onInclude={() => {
            if (!canEditMembership) {
              toast.info('This campaign is not Manual — edit its targeting from Edit instead of picking buyers here.');
              return;
            }
            addBuyers.mutate(selection.selectedIds, { onSuccess: () => selection.clearSelection() });
          }}
          onRemove={() => {
            if (!canEditMembership) {
              toast.info('This campaign is not Manual — edit its targeting from Edit instead of picking buyers here.');
              return;
            }
            removeBuyers.mutate(selection.selectedIds, { onSuccess: () => selection.clearSelection() });
          }}
        />
        <FilterBar
          count={`${rows.length} of ${total} buyers${isTransitioning ? ' · Updating' : ''}`}
          searchPlaceholder="Search buyer or geography…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          groups={filterGroups}
          searchValue={search}
          searchLoading={search.trim() !== debouncedSearch.trim()}
          onSearchChange={setSearch}
          sortOptions={[
            `${primaryDemandLabel} (high → low)`,
            `${demandSingularLabel(primaryDemandKind)} Count (high → low)`,
            'Recently opened',
            'Buyer name (A → Z)',
          ]}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: <SelectAllCheckbox checked={selection.allSelected} indeterminate={selection.someSelected} onChange={selection.toggleVisible} />, width: 48, className: 'px-5' },
            { label: 'Buyer Name', width: 280, className: 'px-5' },
            { label: 'Member', width: 150, className: 'px-5' },
            { label: 'Geography', className: 'px-5' },
            { label: 'Status', className: 'px-5' },
            { label: primaryDemandLabel, align: 'right', className: 'px-5' },
            { label: `Last ${demandSingularLabel(primaryDemandKind)}`, className: 'px-5' },
            { label: 'Last opened', className: 'px-5' },
            { label: 'Last Conversion', className: 'px-5' },
          ]}
          tableMinWidth={1180}
          showEmptyState={!isInitialLoading && rows.length === 0}
          emptyState={<div className="py-16 text-center text-sm text-cream-500">No buyers match these filters.</div>}
        >
          {isInitialLoading ? (
            <TableBodySkeleton columns={8} />
          ) : (
            rows.map((buyer) => {
              const isSelected = selection.selectedIds.includes(buyer.buyer_id);
              const demandValue = buyer.demand_value ?? buyer.spend;
              const demandCount = buyer.demand_count ?? buyer.orders;
              const normalizedStatus = normalizeStatus(buyer.opened_status);
              const lastConversionAt = buyer.last_conversion_at ?? buyer.last_order_at;
              return (
                <SelectableRow key={buyer.buyer_id} selected={isSelected}>
                  <td className="px-3 py-3"><RowSelectCheckbox checked={isSelected} onChange={() => selection.toggleRow(buyer.buyer_id)} /></td>
                  <td className="px-3 py-3">
                    <p className="text-base font-medium text-cream-900">{buyer.buyer_name}</p>
                    <p className="mt-0.5 text-xs text-cream-700">{buyerAppLabel(buyer.buyer_app_status)}</p>
                  </td>
                  <td className="px-3 py-3"><MemberToggle checked={Boolean(buyer.is_member)} label={`${buyer.buyer_name} campaign membership`} /></td>
                  <td className="px-3 py-3 text-base text-cream-900">{buyer.geography_label ?? buyer.city ?? '—'}</td>
                  <td className="px-3 py-3"><StatusTag label={normalizedStatus} tone={statusTone(buyer.opened_status)} /></td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-display text-md text-cream-950">{demandValue > 0 ? formatNumberValue(demandValue, 'CURRENCY_THRESHOLD') : '—'}</p>
                    <p className="mt-0.5 text-xs text-cream-600">{demandCount > 0 ? demandCountLabel(buyer.primary_demand_kind, demandCount) : '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-base text-cream-700">{buyer.last_primary_demand_at ? formatDate(buyer.last_primary_demand_at) : '—'}</td>
                  <td className="px-3 py-3 text-base text-cream-700">{buyer.last_opened_at ? formatDate(buyer.last_opened_at) : '—'}</td>
                  <td className="px-3 py-3 text-base text-cream-700">{lastConversionAt ? formatDate(lastConversionAt) : '—'}</td>
                </SelectableRow>
              );
            })
          )}
        </LandingTable>
        {total > 50 ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= total || query.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
