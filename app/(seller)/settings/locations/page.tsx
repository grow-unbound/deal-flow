import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { LocationsSettingsClient } from '@/components/seller/settings/LocationsSettingsClient';
import { PageWrap } from '@/components/seller/layout';

export default function SettingsLocationsPage() {
  return (
    <PageWrap>
      <SellerTopbar
        title="Locations"
        subtitle="Warehouses, dispatch points, and branches. Inventory is tracked per location where enabled."
      />
      <LocationsSettingsClient />
    </PageWrap>
  );
}
