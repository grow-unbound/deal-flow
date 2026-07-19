'use client';

import { LocationOrdersTab } from './LocationOrdersTab';

export function LocationInvoicesTab({ locationId }: { locationId: string }) {
  return <LocationOrdersTab locationId={locationId} kind="invoice" routeBase="/invoices" />;
}
