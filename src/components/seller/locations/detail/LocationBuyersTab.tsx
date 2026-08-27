'use client';

import { useMemo, useState } from 'react';
import { Smartphone, Users } from 'lucide-react';

import { FilterBar, LandingTable } from '@/components/seller/layout';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useFlag } from '@/hooks/useFeatureFlag';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { useDebounce } from '@/hooks/useDebounce';
import { useLocationBuyers, type LocationPeriodBuyerRow } from '@/hooks/useLocations';
import { cn, formatNumberValue } from '@/lib/utils';

type SortOption = 'Sales (high → low)' | 'Outstanding (high → low)' | 'Overdue (high → low)';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'CU';
}

function BuyerAppAvatar({ name, enabled }: { name: string; enabled: boolean }) {
  const label = enabled ? 'Buyer App enabled' : 'Buyer App disabled';
  if (enabled) {
    return (
      <div
        title={label}
        aria-label={label}
        className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border border-teal-200 bg-teal-100 text-teal-700"
      >
        <Smartphone size={18} strokeWidth={2} />
      </div>
    );
  }
  return (
    <div
      title={label}
      aria-label={label}
      className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border border-dashed border-cream-400 bg-cream-100 text-[13px] font-display font-medium uppercase leading-none text-cream-500"
    >
      {getInitials(name)}
    </div>
  );
}

function BuyerNameCell({ name, phone, showBuyerApp, buyerAppEnabled }: {
  name: string;
  phone: string | null;
  showBuyerApp: boolean;
  buyerAppEnabled: boolean;
}) {
  const nameBlock = (
    <div className="min-w-0">
      <p className="truncate text-base font-medium text-cream-900">{name}</p>
      <p className="mt-0.5 truncate text-sm text-cream-700">{phone?.trim() || '—'}</p>
    </div>
  );
  if (!showBuyerApp) return nameBlock;
  return (
    <div className="flex items-center gap-3">
      <BuyerAppAvatar name={name} enabled={buyerAppEnabled} />
      {nameBlock}
    </div>
  );
}

export function LocationBuyersTab({ locationId }: { locationId: string }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('Sales (high → low)');
  const debouncedSearch = useDebounce(search, 300);
  const isInterim = search !== debouncedSearch;

  const buyerAppFlag = useFlag('BUYER_APP');
  const { data: settings } = useTenantSettings();
  const showBuyerApp = buyerAppFlag && settings?.modules.buyer_app.enabled !== false;

  const { data, isLoading, isError, refetch } = useLocationBuyers(locationId);
  const allBuyers = data?.buyers ?? [];

  const rows = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    let next = allBuyers;
    if (needle) {
      next = next.filter((buyer) =>
        buyer.business_name.toLowerCase().includes(needle) || (buyer.phone ?? '').includes(needle),
      );
    }
    return [...next].sort((a, b) => {
      if (sortBy === 'Outstanding (high → low)') return b.receivable_amount - a.receivable_amount;
      if (sortBy === 'Overdue (high → low)') return b.overdue_amount - a.overdue_amount;
      return b.invoice_value - a.invoice_value;
    });
  }, [allBuyers, debouncedSearch, sortBy]);

  if (isError) {
    return (
      <ErrorState
        heading="Couldn't load buyers"
        description="There was a problem fetching buyers for this location."
        onRetry={() => refetch()}
      />
    );
  }

  const showTableSkeleton = isLoading && !data;
  const tableMinWidth = showBuyerApp ? 900 : 800;

  return (
    <section className="mt-5 min-w-0 max-w-full">
      <FilterBar
        count={`Showing ${rows.length} of ${allBuyers.length}${isInterim ? ' · Updating' : ''}`}
        searchPlaceholder="Search by buyer name, phone number…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        sortOptions={['Sales (high → low)', 'Outstanding (high → low)', 'Overdue (high → low)']}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />

      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={showBuyerApp ? 6 : 5} tableMinWidth={tableMinWidth} />
      ) : (
        <LandingTable
          showEmptyState={rows.length === 0}
          emptyState={
            <EmptyState
              icon={<Users size={28} strokeWidth={1.5} />}
              heading={search.trim() ? 'No matching buyers' : 'No buyers this month'}
              description={
                search.trim()
                  ? 'Try a different search.'
                  : 'This location has no invoiced buyers in the current month.'
              }
            />
          }
          columns={[
            { label: 'Buyer', width: '280px', minWidth: 240, maxWidth: 360, className: 'px-5' },
            { label: 'Sales · This month', align: 'right', minWidth: 130, maxWidth: 170, className: 'px-5' },
            { label: 'Invoices', align: 'right', minWidth: 90, maxWidth: 120, className: 'px-5' },
            { label: 'Outstanding', align: 'right', minWidth: 120, maxWidth: 150, className: 'px-5' },
            { label: 'Overdue', align: 'right', minWidth: 110, maxWidth: 140, className: 'px-5' },
            { label: 'Credit Used', align: 'right', minWidth: 130, maxWidth: 160, className: 'px-5' },
          ]}
          tableMinWidth={tableMinWidth}
        >
          {rows.map((buyer: LocationPeriodBuyerRow) => {
            const creditRatio = buyer.credit_limit > 0 ? buyer.credit_used / buyer.credit_limit : 0;
            return (
              <tr key={buyer.buyer_id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
                <td className="px-3 py-3 text-base text-cream-900">
                  <BuyerNameCell
                    name={buyer.business_name}
                    phone={buyer.phone}
                    showBuyerApp={Boolean(showBuyerApp)}
                    buyerAppEnabled={buyer.buyer_app_enabled}
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="font-display text-md font-normal tabular-nums text-cream-900">
                    {formatNumberValue(buyer.invoice_value, 'CURRENCY_THRESHOLD')}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="font-mono text-base tabular-nums text-cream-900">
                    {formatNumberValue(buyer.invoice_count, 'COUNT')}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-base text-cream-900">
                  <span className="font-display text-md font-normal tabular-nums text-cream-900">
                    {formatNumberValue(buyer.receivable_amount, 'CURRENCY_THRESHOLD')}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-base text-cream-900">
                  <span className="font-display text-md font-normal tabular-nums text-cream-900">
                    {buyer.overdue_amount > 0 ? formatNumberValue(buyer.overdue_amount, 'CURRENCY_THRESHOLD') : '—'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="ml-auto flex w-[120px] flex-col items-end gap-1">
                    <div className="h-[5px] w-full overflow-hidden rounded-full bg-cream-200">
                      <div
                        className={cn('h-[5px] rounded-full', creditRatio > 0.75 ? 'bg-warning-500' : 'bg-teal-500')}
                        style={{ width: `${Math.min(100, Math.round(creditRatio * 100))}%` }}
                      />
                    </div>
                    <span className="text-xs text-cream-700">
                      <span className="tabular-inline">{formatNumberValue(buyer.credit_used, 'CURRENCY_EXACT')}</span>
                      {' / '}
                      <span className="tabular-inline">{formatNumberValue(buyer.credit_limit, 'CURRENCY_EXACT')}</span>
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </LandingTable>
      )}
    </section>
  );
}
