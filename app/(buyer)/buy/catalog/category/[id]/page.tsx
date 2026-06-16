import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerCatalogCategoryPage({ params }: PageProps) {
  const { id } = await params;
  return <CatalogFilteredBrowse mode="category" id={id} />;
}
