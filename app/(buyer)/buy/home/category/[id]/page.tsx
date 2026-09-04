import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { loadBuyerCategoryTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';
import { loadInitialCatalogListData } from '@/lib/server/buyer-catalog-list-ssr';

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
  const { catalogPage, brands, categories } = await loadInitialCatalogListData('category', id);
  return (
    <CatalogFilteredBrowse
      mode="category"
      id={id}
      initialCatalogPage={catalogPage}
      initialBrands={brands ?? undefined}
      initialCategories={categories ?? undefined}
    />
  );
}
