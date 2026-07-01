'use client';

import { LocationOrdersTab } from './LocationOrdersTab';

export function LocationInvoicesTab({
  rows,
}: {
  rows: Parameters<typeof LocationOrdersTab>[0]['rows'];
}) {
  return (
    <LocationOrdersTab
      kind="invoice"
      rows={rows}
      title="Invoices"
      description="All invoices issued at this location"
      routeBase="/invoices"
    />
  );
}
