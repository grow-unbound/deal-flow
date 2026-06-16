import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerCatalogBrandPage({ params }: PageProps) {
  const { id } = await params;
  return <CatalogFilteredBrowse mode="brand" id={id} />;
}
