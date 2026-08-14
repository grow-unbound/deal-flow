import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerCatalogListPage({ params }: PageProps) {
  const { id } = await params;
  await requireBuyerDeliverySelection(`/buy/home/list/${id}`);
  return <CatalogFilteredBrowse mode="list" id={id} />;
}
