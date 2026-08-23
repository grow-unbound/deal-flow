'use client';

import { CardEmptyState } from '@/components/seller/detail';
import { formatNumberValue } from '@/lib/utils';
import type { SellerDashboardLocationPerformanceEntryV4 } from '@/types/seller-dashboard';

const BARS: Array<{ id: 'sales_value' | 'overdue_amount' | 'open_demand_value'; label: string; color: string }> = [
  { id: 'sales_value', label: 'Sales', color: 'var(--teal-700)' },
  { id: 'overdue_amount', label: 'Overdue', color: 'var(--danger-500)' },
  { id: 'open_demand_value', label: 'Open demand', color: 'var(--ember-700)' },
];

function LocationTileSkeleton() {
  return (
    <div className="rounded-[12px] border border-cream-300 bg-cream-50 p-4">
      <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
      <div className="mt-3 flex items-end gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 flex-1 animate-pulse rounded-t bg-cream-200" />
        ))}
      </div>
    </div>
  );
}

function LocationTile({ location }: { location: SellerDashboardLocationPerformanceEntryV4 }) {
  // Scaled within the tile, not across tiles: this is an operational-risk
  // read (is overdue/open-demand large relative to this location's own
  // sales), not a cross-location revenue-share comparison.
  const max = Math.max(location.sales_value, location.overdue_amount, location.open_demand_value, 1);

  return (
    <div className="rounded-[12px] border border-cream-300 bg-white p-4">
      <p className="truncate text-sm font-semibold text-cream-900">{location.name}</p>
      <div className="mt-3 flex h-16 items-end gap-2">
        {BARS.map((bar) => {
          const value = location[bar.id];
          const heightPct = Math.max((value / max) * 100, value > 0 ? 4 : 0);
          return (
            <div key={bar.id} className="flex h-full flex-1 flex-col justify-end" title={`${bar.label}: ${formatNumberValue(value, 'CURRENCY_THRESHOLD')}`}>
              <div
                className="w-full rounded-t"
                style={{ height: `${heightPct}%`, backgroundColor: bar.color, minHeight: value > 0 ? 2 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-1">
        {BARS.map((bar) => (
          <span key={bar.id} className="flex-1 truncate text-center text-xs text-cream-600">
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LocationPerformanceGrid({
  locations,
  loading,
}: {
  locations: SellerDashboardLocationPerformanceEntryV4[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <LocationTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <div className="p-5">
        <CardEmptyState title="No location metrics yet" description="Sales, overdue, and open-demand bars will appear once location-level activity is recorded." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {locations.map((location) => (
        <LocationTile key={location.location_id} location={location} />
      ))}
    </div>
  );
}
