'use client';

import { LocationOrdersTab } from './LocationOrdersTab';

export function LocationInvoicesTab({ locationId, locationName }: { locationId: string; locationName?: string | null }) {
  return <LocationOrdersTab locationId={locationId} locationName={locationName} kind="invoice" routeBase="/invoices" />;
}
