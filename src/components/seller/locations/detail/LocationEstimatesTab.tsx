'use client';

import { LocationOrdersTab } from './LocationOrdersTab';

export function LocationEstimatesTab({ locationId, locationName }: { locationId: string; locationName?: string | null }) {
  return <LocationOrdersTab locationId={locationId} locationName={locationName} kind="estimate" routeBase="/estimates" />;
}
