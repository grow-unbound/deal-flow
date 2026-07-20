'use client';

import { LocationOrdersTab } from './LocationOrdersTab';

export function LocationEstimatesTab({ locationId }: { locationId: string }) {
  return <LocationOrdersTab locationId={locationId} kind="estimate" routeBase="/estimates" />;
}
