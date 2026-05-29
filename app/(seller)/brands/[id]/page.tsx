import { FeatureGate } from '@/components/FeatureGate';
import { BrandDetailPage } from '@/components/seller/brands/detail';

export default async function BrandDetailsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <BrandDetailPage id={id} />
    </FeatureGate>
  );
}
