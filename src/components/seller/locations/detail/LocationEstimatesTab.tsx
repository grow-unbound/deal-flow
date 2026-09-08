'use client';

import { LocationOrdersTab } from './LocationOrdersTab';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export function LocationEstimatesTab({ locationId, locationName }: { locationId: string; locationName?: string | null }) {
  return <LocationOrdersTab locationId={locationId} locationName={locationName} kind="estimate" routeBase={SELLER_ROUTES.sales.estimates} />;
}
