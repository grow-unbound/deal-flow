import { FeatureGate } from '@/components/FeatureGate';
import { CatalogDetailPage } from '@/components/seller/catalogs/detail';

export default async function CatalogDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <FeatureGate flag="CATALOG_PUBLISHING">
      <CatalogDetailPage id={id} />
    </FeatureGate>
  );
}
