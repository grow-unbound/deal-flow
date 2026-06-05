'use client';

import { useMemo, useState } from 'react';
import { FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import type { CatalogDetailResponse } from '@/hooks/useCatalogs';
import { formatCompactInr, formatDate } from '@/lib/utils';

type SortOption = 'GMV (high → low)' | 'Orders (high → low)' | 'Recently opened' | 'Buyer name (A → Z)';

interface CatalogBuyersTabProps {
  buyers: CatalogDetailResponse['buyers'];
  selectedCohort: CatalogDetailResponse['header']['selected_cohort'];
}

function statusTone(status: CatalogDetailResponse['buyers'][number]['opened_status']) {
  if (status === 'Purchased') return 'success';
  if (status === 'Opened') return 'success';
  return 'warning';
}

export function CatalogBuyersTab({ buyers, selectedCohort }: CatalogBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All buyers');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');

  const totals = useMemo(() => ({
    opens: buyers.filter((buyer) => buyer.opened_status !== 'Not yet').length,
    purchasers: buyers.filter((buyer) => buyer.opened_status === 'Purchased').length,
    gmv: buyers.reduce((sum, buyer) => sum + buyer.spend, 0),
  }), [buyers]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return buyers
      .filter((buyer) => {
        if (activeChip === 'Purchased') return buyer.opened_status === 'Purchased';
        if (activeChip === 'Opened') return buyer.opened_status === 'Opened';
        if (activeChip === 'Not yet') return buyer.opened_status === 'Not yet';
        return true;
      })
      .filter((buyer) => !query || buyer.buyer_name.toLowerCase().includes(query) || buyer.city.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortBy === 'Orders (high → low)') return b.orders - a.orders;
        if (sortBy === 'Recently opened') {
          return new Date(b.last_opened_at ?? 0).getTime() - new Date(a.last_opened_at ?? 0).getTime();
        }
        if (sortBy === 'Buyer name (A → Z)') return a.buyer_name.localeCompare(b.buyer_name);
        return b.spend - a.spend;
      });
  }, [activeChip, buyers, search, sortBy]);

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-[17px] text-cream-950">Selected cohort</h3>
            <p className="mt-1 text-[14px] text-cream-900">{selectedCohort.display_label}</p>
            <p className="mt-1 text-[13px] text-cream-700">
              {selectedCohort.member_count} buyers · scope {selectedCohort.scope_type === 'all' ? 'all buyers' : selectedCohort.scope_type}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-cream-700">Opens</p>
              <p className="mt-1 font-display text-[24px] leading-none text-cream-950">{totals.opens}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-cream-700">Purchasers</p>
              <p className="mt-1 font-display text-[24px] leading-none text-cream-950">{totals.purchasers}</p>
            </div>
            <div className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-right">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-cream-700">Attributed GMV</p>
              <p className="mt-1 font-display text-[24px] leading-none text-cream-950">{formatCompactInr(totals.gmv, 1)}</p>
            </div>
          </div>
        </div>
      </article>

      <div>
        <FilterBar
          count={`${filtered.length} buyers`}
          searchPlaceholder="Search buyer or city…"
          chips={['All buyers', 'Purchased', 'Opened', 'Not yet']}
          activeChip={activeChip}
          sortBy={sortBy}
          hideViewToggle
          searchValue={search}
          onSearchChange={setSearch}
          onChipChange={setActiveChip}
          sortOptions={['GMV (high → low)', 'Orders (high → low)', 'Recently opened', 'Buyer name (A → Z)']}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            { label: 'Buyer', className: 'px-5' },
            { label: 'Audience', className: 'px-5' },
            { label: 'Opened', className: 'px-5' },
            { label: 'Orders', align: 'right', className: 'px-5' },
            { label: 'GMV', align: 'right', className: 'px-5' },
            { label: 'Last opened', className: 'px-5' },
            { label: 'Last order', className: 'px-5' },
          ]}
        >
          {filtered.map((buyer) => (
            <tr key={buyer.buyer_id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
              <td className="px-5 py-3.5 text-cream-900">
                <p className="text-[13.5px] font-medium">{buyer.buyer_name}</p>
                <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-cream-700">{buyer.city}</p>
              </td>
              <td className="px-5 py-3.5 text-[13px] text-cream-900">{buyer.cohort_label}</td>
              <td className="px-5 py-3.5">
                <StatusTag label={buyer.opened_status} tone={statusTone(buyer.opened_status)} />
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] text-cream-900">{buyer.orders}</td>
              <td className="px-5 py-3.5 text-right font-display text-[15px] text-cream-950">{buyer.spend > 0 ? formatCompactInr(buyer.spend, 1) : '—'}</td>
              <td className="px-5 py-3.5 text-[13px] text-cream-700">{buyer.last_opened_at ? formatDate(buyer.last_opened_at) : '—'}</td>
              <td className="px-5 py-3.5 text-[13px] text-cream-700">{buyer.last_order_at ? formatDate(buyer.last_order_at) : '—'}</td>
            </tr>
          ))}
        </LandingTable>
      </div>
    </section>
  );
}
