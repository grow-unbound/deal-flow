import { FeatureGate } from '@/components/FeatureGate';
import { LocationDetailPage } from '@/components/seller/locations/detail/LocationDetailPage';

export default async function LocationDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <LocationDetailPage id={id} />
    </FeatureGate>
  );
}
