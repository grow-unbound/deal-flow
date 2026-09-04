import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = storefrontPageTitle('Catalog');

export default async function BuyerCatalogListPage({ params }: PageProps) {
  const { id } = await params;
  await requireBuyerDeliverySelection(`/buy/home/list/${id}`);
  return <CatalogFilteredBrowse mode="list" id={id} />;
}
