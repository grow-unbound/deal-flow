import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerCatalogListRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/buy/home/list/${id}`);
}
