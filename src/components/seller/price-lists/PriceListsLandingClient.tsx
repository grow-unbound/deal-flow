'use client';

import { useMemo, useState } from 'react';
import { Copy, Plus, ListOrdered } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { usePriceListsLanding, type PriceListLandingRow, type PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { cn, formatDate } from '@/lib/utils';
import { formatStrategySummary } from '@/lib/price-list-strategy';

type LandingChip = 'Active' | 'Draft' | 'Expired';
type SortOption = 'Recently updated' | 'Name (A-Z)' | 'Products (high → low)' | 'Validity (latest end date)' | 'Priority (high → low)';

const STATUS_OPTIONS: LandingChip[] = ['Draft', 'Active', 'Expired'];
const SORT_OPTIONS: SortOption[] = ['Recently updated', 'Name (A-Z)', 'Products (high → low)', 'Validity (latest end date)', 'Priority (high → low)'];

function PriceListsLandingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-[40rem]" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[14px]" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-14 rounded-[14px]" />
        <Skeleton className="h-[30rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function titleCaseStatus(status: PriceListLandingRow['status']): 'Active' | 'Draft' | 'Expired' {
  if (status === 'active') return 'Active';
  if (status === 'draft') return 'Draft';
  return 'Expired';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toStatusTone(status: PriceListLandingRow['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'draft') return 'warning';
  return 'neutral';
}

function entityHue(index: number): 'teal' | 'ember' | 'cream' {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function PriceListsLandingContent({ initialData }: { initialData: PriceListsLandingResponse | null }) {
  const router = useRouter();
  const { isSellerAssistant } = useRole();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-price-lists-landing',
    version: 2,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
      },
      sortBy: 'Recently updated' as SortOption,
    },
  });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { status: [] };
  const { data, isLoading, isError, refetch } = usePriceListsLanding({ search, status: filters.status }, initialData);
  useRouteScrollRestoration({
    storageKey: 'seller-price-lists-landing',
    ready: !isLoading,
  });
  const statusFilter = filters.status ?? [];
  const groups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS.map((value) => ({ value, label: value })),
      values: statusFilter,
      onChange: (values) =>
        setRouteState((current) => ({
          ...current,
          filters: { ...(current.filters ?? filters), status: values },
        })),
    },
  ];
  const allRows = data?.price_lists ?? [];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const statusFiltered = allRows.filter((row) => {
      if (statusFilter.length === 0 || statusFilter.includes('All')) return true;
      return statusFilter.some((value) => {
        if (value === 'Active') return row.status === 'active';
        if (value === 'Draft') return row.status === 'draft';
        if (value === 'Expired') return row.status === 'expired';
        return false;
      });
    });

    const searched = statusFiltered.filter((row) => {
      if (!query) return true;
      const cohorts = row.cohort_names.join(' ').toLowerCase();
      return row.name.toLowerCase().includes(query) || cohorts.includes(query);
    });

    return searched.sort((a, b) => {
      if (sortBy === 'Name (A-Z)') return a.name.localeCompare(b.name);
      if (sortBy === 'Products (high → low)') return b.product_count - a.product_count;
      if (sortBy === 'Priority (high → low)') return b.priority - a.priority;
      if (sortBy === 'Validity (latest end date)') {
        return new Date(b.valid_to ?? 0).getTime() - new Date(a.valid_to ?? 0).getTime();
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [allRows, search, sortBy, statusFilter]);

  if (isLoading) return <PriceListsLandingSkeleton />;

  if (isError) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load price lists"
          description="There was a problem fetching your price lists. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }

  return (
    <>
      <PageWrap>
        <PageHeader
          eyebrow="Pricing"
          title="Price Lists"
          subtitle={isSellerAssistant
            ? 'Reference pricing by cohort and validity window. Use this view to verify what buyers should be seeing.'
            : 'Custom pricing per cohort. Each list sets prices on a window — once it lapses, buyers fall back to base. Keep them fresh.'}
          horizon="This month"
          {...(isSellerAssistant ? {} : {
            primary: 'Add a price list',
            onPrimaryClick: () => router.push('/price-lists/new'),
          })}
        />

        <InsightStrip4
          tiles={[
            {
              label: 'Active lists',
              value: `${data?.kpis.active_lists ?? 0}`,
              sub: `${data?.kpis.draft_lists ?? 0} in draft`,
            },
            {
              label: 'Customer groups covered',
              value: `${data?.kpis.cohorts_covered ?? 0}`,
              sub: `of ${data?.kpis.cohorts_total ?? 0} cohorts`,
            },
            {
              label: 'Expiring soon',
              value: `${data?.kpis.expiring_soon ?? 0}`,
              sub: 'renew before they lapse',
              tone: 'warn',
            },
            {
              label: 'Products covered',
              value: `${data?.kpis.products_with_overrides ?? 0}`,
              sub: isSellerAssistant ? 'visible in these lists' : 'custom priced SKUs',
            },
          ]}
        />

        <V3CalloutPanel
          items={[
            {
              kind: 'risk',
              eyebrow: 'Expiring soon',
              hint: `${data?.todays_read.expiring_soon.length ?? 0}`,
              rows: (data?.todays_read.expiring_soon ?? []).map((row, index) => ({
                initials: row.initials,
                hue: entityHue(index),
                name: row.name,
                reason: `Expires ${row.valid_until_label} · ${row.cohorts_count} cohort(s)`,
                trailing: <StatusTag label={titleCaseStatus(row.status)} tone={toStatusTone(row.status)} />,
              })),
            },
            {
              kind: 'info',
              eyebrow: 'Most coverage',
              hint: 'by products',
              rows: (data?.todays_read.most_coverage ?? []).map((row, index) => ({
                initials: row.initials,
                hue: entityHue(index),
                name: row.name,
                reason: `${row.product_count} products · valid until ${row.valid_until_label}`,
                trailing: row.product_count,
              })),
            },
            {
              kind: 'opportunity',
              eyebrow: 'Uncovered cohorts',
              hint: 'no active list',
              rows: (data?.todays_read.uncovered_cohorts ?? []).map((row, index) => ({
                initials: row.initials,
                hue: entityHue(index),
                name: row.name,
                reason: isSellerAssistant
                  ? `${row.member_count} buyers · currently using base price`
                  : `${row.member_count} buyers · falling back to base price`,
                trailing: row.member_count,
              })),
            },
          ]}
        />

        <FilterBar
          count={`${filteredRows.length} price lists`}
          searchPlaceholder="Search price list or cohort…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          groups={groups}
          searchValue={search}
          onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
          sortOptions={SORT_OPTIONS}
          onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
        />

        <LandingTable
          showEmptyState={filteredRows.length === 0}
          emptyState={
            <EmptyState
              icon={<ListOrdered size={28} strokeWidth={1.5} />}
              heading={search.trim() || statusFilter.length > 0 ? 'No matching price lists' : 'No price lists yet'}
              description={
                search.trim() || statusFilter.length > 0
                  ? 'Try a different search or status filter.'
                  : isSellerAssistant
                    ? 'No price lists are available yet.'
                    : 'Create a price list to set cohort pricing.'
              }
              action={!isSellerAssistant ? (
                <Button variant="accent" asChild>
                  <Link href="/price-lists/new" className="inline-flex items-center gap-1.5">
                    <Plus size={13} />
                    Add a price list
                  </Link>
                </Button>
              ) : undefined}
            />
          }
          columns={[
            { label: 'Price list', minWidth: 280, maxWidth: 360, className: 'px-5' },
            { label: 'Pricing strategy', minWidth: 180, maxWidth: 220, className: 'px-5' },
            { label: 'Priority', align: 'center', minWidth: 120, maxWidth: 140, className: 'px-5' },
            { label: 'Products', align: 'center', minWidth: 120, maxWidth: 140, className: 'px-5' },
            { label: 'Validity', minWidth: 200, maxWidth: 260, className: 'px-5' },
            { label: 'Avg discount', align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
            ...(isSellerAssistant ? [] : [{ label: 'Avg margin', align: 'right' as const, minWidth: 140, maxWidth: 160, className: 'px-5' }]),
            { label: 'Status', minWidth: 140, maxWidth: 180, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1240}
        >
          {filteredRows.map((row) => {
            const validity = `${formatDate(row.valid_from ?? row.created_at)} → ${row.valid_to ? formatDate(row.valid_to) : 'Open'}`;
            const isExpired = row.status === 'expired';
            const strategySub = formatStrategySummary(row.pricing_strategy, row.strategy_value);

            return (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
                onClick={() => router.push(`/price-lists/${row.id}`)}
              >
                <td className="px-5 py-3.5 text-base text-cream-900">
                  <div className="ent flex items-center gap-3">
                    <EntityAvatar initials={getInitials(row.name)} hue="teal" size={38} />
                    <div className="min-w-0">
                      <p className="ent-name truncate text-base font-medium text-cream-900">{row.name}</p>
                      <p className="ent-sub mt-0.5 truncate text-xs text-cream-500">
                        {row.description ?? strategySub}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-cream-800">
                  {strategySub}
                </td>
                <td className="px-5 py-3.5 text-center font-mono text-base font-semibold text-cream-900 tabular-nums">
                  {row.priority}
                </td>
                <td className="px-5 py-3.5 text-center font-mono text-base font-semibold text-cream-900 tabular-nums">
                  {row.product_count}
                </td>
                <td className={`px-5 py-3.5 font-mono text-sm ${isExpired ? 'text-cream-500 line-through' : 'text-cream-900'}`}>
                  {validity}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {row.avg_discount_pct != null ? (
                    <span
                      className={cn(
                        'font-mono text-base font-semibold tabular-nums',
                        row.avg_discount_pct >= 0 ? 'text-teal-700' : 'text-danger-700',
                      )}
                    >
                      {row.avg_discount_pct >= 0 ? '-' : '+'}
                      {Math.abs(row.avg_discount_pct).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-cream-400">—</span>
                  )}
                </td>
                {!isSellerAssistant ? (
                  <td className="px-5 py-3.5 text-right">
                    {row.avg_margin_pct != null ? (
                      <span className="font-mono text-base font-semibold tabular-nums text-cream-900">
                        {row.avg_margin_pct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-cream-400">—</span>
                    )}
                  </td>
                ) : null}
                <td className="px-5 py-3.5">
                  <StatusTag label={titleCaseStatus(row.status)} tone={toStatusTone(row.status)} />
                </td>
                <td className="chev px-4 py-3.5 pr-4 text-right text-md text-cream-500">›</td>
              </tr>
            );
          })}
        </LandingTable>
      </PageWrap>
    </>
  );
}

export function PriceListsLandingClient({ initialData }: { initialData: PriceListsLandingResponse | null }) {
  return (
    <FeatureGate flag="PRICING_ENGINE">
      <PriceListsLandingContent initialData={initialData} />
    </FeatureGate>
  );
}
