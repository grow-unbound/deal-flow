import { FeatureGate } from '@/components/FeatureGate';
import { ProductDetailPage } from '@/components/seller/products/detail';

export default async function ProductDetailsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <ProductDetailPage id={id} />
    </FeatureGate>
  );
}
