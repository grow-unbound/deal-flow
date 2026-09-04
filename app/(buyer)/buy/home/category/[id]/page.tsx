import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { loadBuyerCategoryTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await loadBuyerCategoryTitle(id);
  return storefrontPageTitle(name ?? 'Category');
}

export default async function BuyerCatalogCategoryPage({ params }: PageProps) {
  const { id } = await params;
  await requireBuyerDeliverySelection(`/buy/home/category/${id}`);
  return <CatalogFilteredBrowse mode="category" id={id} />;
}
