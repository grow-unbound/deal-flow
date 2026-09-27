import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerCatalogCategoryRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/buy/home/category/${id}`);
}
