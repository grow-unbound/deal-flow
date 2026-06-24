'use client';

import { useMemo, useState } from 'react';
import { FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import type { BrandDetailBuyer } from '@/hooks/useBrands';
import { formatCompactInr } from '@/lib/utils';

type Sort = 'Spend (high → low)' | 'Spend (low → high)' | 'Orders (high → low)';

interface BrandBuyersTabProps {
  buyers: BrandDetailBuyer[];
}

export function BrandBuyersTab({ buyers }: BrandBuyersTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All buyers');
  const [sortBy, setSortBy] = useState<Sort>('Spend (high → low)');

  const chips = ['All buyers', 'Tier A', 'Tier B', 'Tier C', 'Active'];

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return buyers
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
  }, [buyers, search, activeChip, sortBy]);

  return (
    <section className="mt-5">
      <FilterBar
        count={`${filtered.length} buyers`}
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
            <td className="px-5 py-3.5">
              <p className="text-base font-medium text-cream-900">{buyer.name}</p>
              <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{buyer.city}</p>
            </td>
            <td className="px-5 py-3.5 text-cream-900">{buyer.cohort}</td>
            <td className="px-5 py-3.5 font-display text-md text-cream-950">{formatCompactInr(buyer.spend)}</td>
            <td className="px-5 py-3.5 text-cream-900">{buyer.orders}</td>
            <td className="px-5 py-3.5 text-cream-900">{buyer.last_order ? new Date(buyer.last_order).toLocaleDateString('en-IN') : '—'}</td>
            <td className="px-5 py-3.5 text-cream-900">
              <StatusTag label={buyer.status} tone={buyer.status === 'Active' ? 'success' : 'neutral'} />
            </td>
          </tr>
        ))}
      </LandingTable>
    </section>
  );
}
