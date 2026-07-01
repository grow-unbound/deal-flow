'use client';

import { LocationOrdersTab } from './LocationOrdersTab';

export function LocationEstimatesTab({
  rows,
}: {
  rows: Parameters<typeof LocationOrdersTab>[0]['rows'];
}) {
  return (
    <LocationOrdersTab
      kind="estimate"
      rows={rows}
      title="Estimates"
      description="All estimates created at this location"
      routeBase="/estimates"
    />
  );
}
