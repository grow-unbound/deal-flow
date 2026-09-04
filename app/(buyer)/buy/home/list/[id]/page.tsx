import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';
import { loadInitialCatalogListData } from '@/lib/server/buyer-catalog-list-ssr';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = storefrontPageTitle('Catalog');

export default async function BuyerCatalogListPage({ params }: PageProps) {
  const { id } = await params;
  await requireBuyerDeliverySelection(`/buy/home/list/${id}`);
  const { catalogPage, brands, categories } = await loadInitialCatalogListData('list', id);
  return (
    <CatalogFilteredBrowse
      mode="list"
      id={id}
      initialCatalogPage={catalogPage}
      initialBrands={brands ?? undefined}
      initialCategories={categories ?? undefined}
    />
  );
}
