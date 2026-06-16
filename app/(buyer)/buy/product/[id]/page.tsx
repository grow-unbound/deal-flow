import { notFound } from 'next/navigation';
import { BuyerProductDetailClient } from '@/components/buyer/catalog/BuyerProductDetailClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerProductPage({ params }: PageProps) {
  const { id } = await params;
  if (!id?.trim()) notFound();
  return <BuyerProductDetailClient tenantProductId={id} />;
}
