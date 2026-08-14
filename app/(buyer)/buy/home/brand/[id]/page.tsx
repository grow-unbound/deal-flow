import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerCatalogBrandPage({ params }: PageProps) {
  const { id } = await params;
  await requireBuyerDeliverySelection(`/buy/home/brand/${id}`);
  return <CatalogFilteredBrowse mode="brand" id={id} />;
}
