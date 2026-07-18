'use client';

import { useMemo, useState } from 'react';
import { EntityAvatar, FilterBar, LandingTable } from '@/components/seller/layout';
import type { CohortDetailBuyer } from '@/hooks/useCohorts';
import { useDebounce } from '@/hooks/useDebounce';
import { detailRowsTotal, flattenDetailRows, useCohortBuyersDetail } from '@/hooks/useDetailTabSearch';
import type { CohortRulesSummary } from '@/lib/cohort-rules-summary';
import { formatCompactInr, formatDate } from '@/lib/utils';

type SortOption =
  | 'MTD spend (high → low)'
  | 'Orders (high → low)'
  | 'AOV (high → low)'
  | 'Buyer name (A → Z)'
  | 'Last ordered (recent first)';

function lastOrderedBucket(lastOrderAt: string | null): 'ordered_mtd' | 'dormant' | 'other' {
  if (!lastOrderAt) return 'dormant';
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const placed = new Date(lastOrderAt);
  if (placed >= startOfMonth) return 'ordered_mtd';
  const diffMs = Date.now() - placed.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 30) return 'dormant';
  return 'other';
}

interface CohortBuyersTabProps {
  cohortId: string;
  rules_summary: CohortRulesSummary;
  activeMembersMtd: number;
}

export function CohortBuyersTab({ cohortId, rules_summary, activeMembersMtd }: CohortBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All buyers');
  const [sortBy, setSortBy] = useState<SortOption>('MTD spend (high → low)');

  const debouncedSearch = useDebounce(search, 300);
  const activity = activeChip === 'Ordered this month' ? 'ordered_mtd' : activeChip === 'Dormant' ? 'dormant' : null;
  const sort = sortBy === 'Orders (high → low)' ? 'orders_desc' : sortBy === 'AOV (high → low)' ? 'aov_desc' : sortBy === 'Buyer name (A → Z)' ? 'name_asc' : sortBy === 'Last ordered (recent first)' ? 'last_order_desc' : 'spend_desc';
  const result = useCohortBuyersDetail(cohortId, { query: debouncedSearch, filter: activity, sort });
  const buyers = useMemo(() => flattenDetailRows(result.data), [result.data]);
  const isInterim = search.trim() !== debouncedSearch.trim() || result.isFetching;
  const filtered = useMemo(() => {
    if (!isInterim) return buyers;
    const query = search.trim().toLowerCase();
    return buyers
      .filter((buyer) => {
        if (activeChip === 'Ordered this month') return buyer.orders_mtd > 0;
        if (activeChip === 'Dormant') return lastOrderedBucket(buyer.last_order_at) === 'dormant';
        return true;
      })
      .filter((buyer) => {
        if (!query) return true;
        return (
          buyer.business_name.toLowerCase().includes(query) ||
          (buyer.contact_name ?? '').toLowerCase().includes(query) ||
          buyer.geography_label.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'Orders (high → low)') return b.orders_mtd - a.orders_mtd;
        if (sortBy === 'AOV (high → low)') return b.aov - a.aov;
        if (sortBy === 'Buyer name (A → Z)') return a.business_name.localeCompare(b.business_name);
        if (sortBy === 'Last ordered (recent first)') {
          return new Date(b.last_order_at ?? 0).getTime() - new Date(a.last_order_at ?? 0).getTime();
        }
        return b.mtd_spend - a.mtd_spend;
      });
  }, [activeChip, buyers, isInterim, search, sortBy]);

  const rulesTitle = rules_summary.is_static ? 'Manual member list' : 'Filters applied';
  const rulesSub = rules_summary.is_static
    ? `${rules_summary.matched_of_total_label}. Buyers are explicitly assigned to this cohort.`
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
            This is a static cohort. Membership is managed manually; rule filters do not apply.
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
            No saved filters. This cohort uses its manually curated member list only.
          </div>
        )}

        <div className="mt-3 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Allowed brands</p>
          <p className="mt-1 text-base text-cream-900">{rules_summary.allowed_brands_label}</p>
        </div>
      </article>

      <div>
        <FilterBar
          count={`${isInterim ? filtered.length : detailRowsTotal(result.data)} buyers${result.isFetching ? ' · Updating' : ''}`}
          searchPlaceholder="Search buyer, contact, or geography…"
          chips={['All buyers', 'Ordered this month', 'Dormant']}
          activeChip={activeChip}
          sortBy={sortBy}
          hideViewToggle
          searchValue={search}
          onSearchChange={setSearch}
          onChipChange={setActiveChip}
          sortOptions={[
            'MTD spend (high → low)',
            'Orders (high → low)',
            'AOV (high → low)',
            'Buyer name (A → Z)',
            'Last ordered (recent first)',
          ]}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: 'Buyer', width: 260, className: 'px-5' },
            { label: 'Geography', className: 'px-5' },
            { label: 'Tier', className: 'px-5' },
            { label: 'MTD spend', align: 'right', className: 'px-5' },
            { label: 'Orders', align: 'right', className: 'px-5' },
            { label: 'AOV', align: 'right', className: 'px-5' },
            { label: 'Credit used', align: 'right', className: 'px-5' },
            { label: 'Last ordered', className: 'px-5' },
          ]}
        >
          {filtered.map((buyer) => {
            const subline = buyer.contact_name ?? buyer.external_ref ?? 'No primary contact';
            return (
              <tr key={buyer.buyer_id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
                <td className="px-5 py-3.5 text-cream-900">
                  <div className="flex items-center gap-3">
                    <EntityAvatar initials={buyer.business_name.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase()} hue="teal" size={32} className="rounded-[8px]" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium">{buyer.business_name}</p>
                      <p className="mt-0.5 truncate text-xs text-cream-700">{subline}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-base text-cream-900">{buyer.geography_label}</td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex rounded-full border border-ember-200 bg-ember-50 px-2.5 py-1 text-sm font-medium text-ember-700">
                    {buyer.tier ? `${buyer.tier}-class` : 'Unsorted'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{formatCompactInr(buyer.mtd_spend, 1)}</td>
                <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{buyer.orders_mtd}</td>
                <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">
                  {buyer.orders_mtd > 0 ? formatCompactInr(buyer.aov, 1) : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{formatCompactInr(buyer.credit_used, 1)}</td>
                <td className="px-5 py-3.5 text-base text-cream-700">{buyer.last_order_at ? formatDate(buyer.last_order_at) : '—'}</td>
              </tr>
            );
          })}
        </LandingTable>
        {result.hasNextPage ? <button type="button" className="mt-4 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium" disabled={result.isFetchingNextPage} onClick={() => result.fetchNextPage()}>{result.isFetchingNextPage ? 'Loading…' : 'Load more'}</button> : null}
      </div>
    </section>
  );
}
