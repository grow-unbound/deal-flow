import { FeatureGate } from '@/components/FeatureGate';
import { CategoryDetailPage } from '@/components/seller/categories/detail/CategoryDetailPage';

export default async function CategoryDetailRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <CategoryDetailPage id={id} />
    </FeatureGate>
  );
}
