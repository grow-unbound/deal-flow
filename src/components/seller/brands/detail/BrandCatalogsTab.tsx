'use client';

import { useMemo, useState } from 'react';
import { FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import type { BrandDetailCatalog } from '@/hooks/useBrands';
import { formatCompactInr } from '@/lib/utils';

interface BrandCatalogsTabProps {
  catalogs: BrandDetailCatalog[];
}

type SortOption = 'Sent (recent first)' | 'Sent (oldest first)' | 'GMV (high → low)' | 'Orders (high → low)';

export function BrandCatalogsTab({ catalogs }: BrandCatalogsTabProps) {
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('All statuses');
  const [sortBy, setSortBy] = useState<SortOption>('Sent (recent first)');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalogs
      .filter((catalog) => {
        if (activeChip === 'All statuses') return true;
        return catalog.status.toLowerCase() === activeChip.toLowerCase();
      })
      .filter((catalog) => {
        if (!query) return true;
        return catalog.name.toLowerCase().includes(query) || catalog.cohort.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (sortBy === 'Sent (recent first)') return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime();
        if (sortBy === 'Sent (oldest first)') return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
        if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
        return b.orders - a.orders;
      });
  }, [activeChip, catalogs, search, sortBy]);

  return (
    <section className="mt-5">
      <FilterBar
        count={`${filtered.length} catalogs`}
        searchPlaceholder="Search catalog or cohort…"
        chips={['All statuses', 'published', 'draft', 'ended']}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={setActiveChip}
        sortOptions={['Sent (recent first)', 'Sent (oldest first)', 'GMV (high → low)', 'Orders (high → low)']}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />
      <LandingTable
        columns={[
          { label: 'Campaign name', className: 'px-5' },
          { label: 'Customer group', className: 'px-5' },
          { label: 'GMV', className: 'px-5' },
          { label: 'Orders', className: 'px-5' },
          { label: 'Status', className: 'px-5' },
          { label: 'Sent', className: 'px-5' },
        ]}
        className="rounded-[14px] border border-cream-300"
      >
        {filtered.map((catalog) => (
          <tr key={catalog.id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
            <td className="px-5 py-3.5 text-base font-medium text-cream-900">{catalog.name}</td>
            <td className="px-5 py-3.5 text-cream-900">{catalog.cohort}</td>
            <td className="px-5 py-3.5 font-display text-md text-cream-950">{formatCompactInr(catalog.gmv)}</td>
            <td className="px-5 py-3.5 text-cream-900">{catalog.orders}</td>
            <td className="px-5 py-3.5 text-cream-900">
              <StatusTag
                label={catalog.status}
                tone={catalog.status === 'published' ? 'success' : catalog.status === 'draft' ? 'warning' : 'neutral'}
              />
            </td>
            <td className="px-5 py-3.5 text-cream-900">{new Date(catalog.sent_at).toLocaleDateString('en-IN')}</td>
          </tr>
        ))}
      </LandingTable>
    </section>
  );
}
