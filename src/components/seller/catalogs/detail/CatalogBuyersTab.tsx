'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import { useCatalogBuyers, type CatalogDetailResponse } from '@/hooks/useCatalogs';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatNumberValue } from '@/lib/utils';

type SortOption = 'GMV (high → low)' | 'Conversions (high → low)' | 'Recently opened' | 'Buyer name (A → Z)';

interface CatalogBuyersTabProps {
  catalogId: string;
  buyers: CatalogDetailResponse['buyers'];
  selectedCohort: CatalogDetailResponse['header']['selected_cohort'];
}

function statusTone(status: CatalogDetailResponse['buyers'][number]['opened_status']) {
  if (status === 'Converted') return 'success';
  if (status === 'Opened') return 'success';
  return 'warning';
}

const sortValue: Record<SortOption, string> = {
  'GMV (high → low)': 'gmv_desc',
  'Conversions (high → low)': 'conversions_desc',
  'Recently opened': 'recently_opened',
  'Buyer name (A → Z)': 'name_asc',
};

export function CatalogBuyersTab({ catalogId, buyers, selectedCohort }: CatalogBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All buyers');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);
  const status = activeChip === 'All buyers' ? undefined : activeChip.toLowerCase().replace(/ /g, '_');
  const query = useCatalogBuyers(catalogId, { query: debouncedSearch, status, sort: sortValue[sortBy], page });

  useEffect(() => setPage(0), [debouncedSearch, sortBy, status]);

  const fallbackTotals = useMemo(() => ({
    opens: buyers.filter((buyer) => buyer.opened_status !== 'Not yet').length,
    converted: buyers.filter((buyer) => buyer.opened_status === 'Converted').length,
    gmv: buyers.reduce((sum, buyer) => sum + buyer.spend, 0),
  }), [buyers]);
  const totals = query.data?.totals ?? fallbackTotals;
  const authoritative = query.data?.rows ?? buyers;
  const isTransitioning = query.isFetching || search !== debouncedSearch;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!isTransitioning) return authoritative;
    return authoritative
      .filter((buyer) => {
        if (activeChip === 'Converted') return buyer.opened_status === 'Converted';
        if (activeChip === 'Opened') return buyer.opened_status === 'Opened';
        if (activeChip === 'Not yet') return buyer.opened_status === 'Not yet';
        return true;
      })
      .filter((buyer) => !query || buyer.buyer_name.toLowerCase().includes(query) || buyer.city.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortBy === 'Conversions (high → low)') return b.orders - a.orders;
        if (sortBy === 'Recently opened') {
          return new Date(b.last_opened_at ?? 0).getTime() - new Date(a.last_opened_at ?? 0).getTime();
        }
        if (sortBy === 'Buyer name (A → Z)') return a.buyer_name.localeCompare(b.buyer_name);
        return b.spend - a.spend;
      });
  }, [activeChip, authoritative, isTransitioning, search, sortBy]);
  const total = query.data?.total ?? buyers.length;

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
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">Opens</p>
              <p className="mt-1 font-display text-2xl leading-none text-cream-950">{totals.opens}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">Converted</p>
              <p className="mt-1 font-display text-2xl leading-none text-cream-950">{totals.converted}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-cream-700">Attributed GMV</p>
              <p className="mt-1 font-display text-2xl leading-none text-cream-950">{formatNumberValue(totals.gmv, 'CURRENCY_THRESHOLD')}</p>
            </div>
          </div>
        </div>
      </article>

      <div>
        <FilterBar
          count={`${filtered.length} of ${total} buyers${isTransitioning ? ' · Updating' : ''}`}
          searchPlaceholder="Search buyer or city…"
          chips={['All buyers', 'Converted', 'Opened', 'Not yet']}
          activeChip={activeChip}
          sortBy={sortBy}
          hideViewToggle
          searchValue={search}
          onSearchChange={setSearch}
          onChipChange={setActiveChip}
          sortOptions={['GMV (high → low)', 'Conversions (high → low)', 'Recently opened', 'Buyer name (A → Z)']}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: 'Buyer', className: 'px-5' },
            { label: 'Audience', className: 'px-5' },
            { label: 'Opened', className: 'px-5' },
            { label: 'Conversions', align: 'right', className: 'px-5' },
            { label: 'GMV', align: 'right', className: 'px-5' },
            { label: 'Last opened', className: 'px-5' },
            { label: 'Last conversion', className: 'px-5' },
          ]}
        >
          {filtered.map((buyer) => (
            <tr key={buyer.buyer_id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
              <td className="px-5 py-3.5 text-cream-900">
                <p className="text-base font-medium">{buyer.buyer_name}</p>
                <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{buyer.city}</p>
              </td>
              <td className="px-5 py-3.5 text-base text-cream-900">{buyer.cohort_label}</td>
              <td className="px-5 py-3.5">
                <StatusTag label={buyer.opened_status} tone={statusTone(buyer.opened_status)} />
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{buyer.orders}</td>
              <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{buyer.spend > 0 ? formatNumberValue(buyer.spend, 'CURRENCY_THRESHOLD') : '—'}</td>
              <td className="px-5 py-3.5 text-base text-cream-700">{buyer.last_opened_at ? formatDate(buyer.last_opened_at) : '—'}</td>
              <td className="px-5 py-3.5 text-base text-cream-700">{buyer.last_order_at ? formatDate(buyer.last_order_at) : '—'}</td>
            </tr>
          ))}
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
