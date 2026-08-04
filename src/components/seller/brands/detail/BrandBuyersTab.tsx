'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import { useBrandBuyers, type BrandDetailBuyer } from '@/hooks/useBrands';
import { useDebounce } from '@/hooks/useDebounce';
import { formatNumberValue } from '@/lib/utils';

type Sort = 'Spend (high → low)' | 'Spend (low → high)' | 'Orders (high → low)';

interface BrandBuyersTabProps {
  brandId: string;
  buyers: BrandDetailBuyer[];
}

const sortValue: Record<Sort, string> = {
  'Spend (high → low)': 'spend_desc',
  'Spend (low → high)': 'spend_asc',
  'Orders (high → low)': 'orders_desc',
};

export function BrandBuyersTab({ brandId, buyers }: BrandBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All buyers');
  const [sortBy, setSortBy] = useState<Sort>('Spend (high → low)');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);
  const segment = activeChip === 'Active' ? 'active' : activeChip.startsWith('Tier ') ? `tier_${activeChip.slice(5).toLowerCase()}` : undefined;
  const query = useBrandBuyers(brandId, { query: debouncedSearch, segment, sort: sortValue[sortBy], page });

  useEffect(() => setPage(0), [debouncedSearch, segment, sortBy]);

  const chips = ['All buyers', 'Tier A', 'Tier B', 'Tier C', 'Active'];

  const authoritative = query.data?.rows ?? buyers;
  const isTransitioning = query.isFetching || search !== debouncedSearch;
  const filtered = useMemo(() => {
    if (!isTransitioning) return authoritative;
    const query = search.toLowerCase().trim();
    return authoritative
      .filter((buyer) => {
        if (activeChip === 'All buyers') return true;
        if (activeChip === 'Active') return buyer.status === 'Active';
        return buyer.cohort === activeChip;
      })
      .filter((buyer) => !query || buyer.name.toLowerCase().includes(query) || buyer.city.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortBy === 'Spend (high → low)') return b.spend - a.spend;
        if (sortBy === 'Spend (low → high)') return a.spend - b.spend;
        return b.orders - a.orders;
      });
  }, [activeChip, authoritative, isTransitioning, search, sortBy]);
  const total = query.data?.total ?? buyers.length;

  return (
    <section className="mt-5">
      <FilterBar
        count={`${filtered.length} of ${total} buyers${isTransitioning ? ' · Updating' : ''}`}
        searchPlaceholder="Search buyer or city…"
        chips={chips}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={setActiveChip}
        sortOptions={['Spend (high → low)', 'Spend (low → high)', 'Orders (high → low)']}
        onSortChange={(option) => setSortBy(option as Sort)}
      />
      <LandingTable
        columns={[
          { label: 'Buyer', className: 'px-5' },
          { label: 'Customer group', className: 'px-5' },
          { label: 'Spend', className: 'px-5' },
          { label: 'Orders', className: 'px-5' },
          { label: 'Last order', className: 'px-5' },
          { label: 'Status', className: 'px-5' },
        ]}
      >
        {filtered.map((buyer) => (
          <tr key={buyer.id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
            <td className="px-3 py-3">
              <p className="text-base font-medium text-cream-900">{buyer.name}</p>
              <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{buyer.city}</p>
            </td>
            <td className="px-3 py-3 text-cream-900">{buyer.cohort}</td>
            <td className="px-3 py-3 font-display text-md text-cream-950">{formatNumberValue(buyer.spend, 'CURRENCY_THRESHOLD')}</td>
            <td className="px-3 py-3 text-cream-900">{buyer.orders}</td>
            <td className="px-3 py-3 text-cream-900">{buyer.last_order ? new Date(buyer.last_order).toLocaleDateString('en-IN') : '—'}</td>
            <td className="px-3 py-3 text-cream-900">
              <StatusTag label={buyer.status} tone={buyer.status === 'Active' ? 'success' : 'neutral'} />
            </td>
          </tr>
        ))}
      </LandingTable>
      {total > 50 ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= total || query.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      ) : null}
    </section>
  );
}
