import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { loadBuyerBrandTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';
import { loadInitialCatalogListData } from '@/lib/server/buyer-catalog-list-ssr';

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
  const { catalogPage, brands, categories } = await loadInitialCatalogListData('brand', id);
  return (
    <CatalogFilteredBrowse
      mode="brand"
      id={id}
      initialCatalogPage={catalogPage}
      initialBrands={brands ?? undefined}
      initialCategories={categories ?? undefined}
    />
  );
}
