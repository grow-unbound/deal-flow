import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerCatalogCategoryPage({ params }: PageProps) {
  const { id } = await params;
  await requireBuyerDeliverySelection(`/buy/home/category/${id}`);
  return <CatalogFilteredBrowse mode="category" id={id} />;
}
