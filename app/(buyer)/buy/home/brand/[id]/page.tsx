import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { loadBuyerBrandTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await loadBuyerBrandTitle(id);
  return storefrontPageTitle(name ?? 'Brand');
}

export default async function BuyerCatalogBrandPage({ params }: PageProps) {
  const { id } = await params;
  await requireBuyerDeliverySelection(`/buy/home/brand/${id}`);
  return <CatalogFilteredBrowse mode="brand" id={id} />;
}
