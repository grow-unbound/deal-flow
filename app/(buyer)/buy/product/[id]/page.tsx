import { notFound } from 'next/navigation';
import { BuyerProductDetailClient } from '@/components/buyer/catalog/BuyerProductDetailClient';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BuyerProductPage({ params }: PageProps) {
  const { id } = await params;
  if (!id?.trim()) notFound();
  await requireBuyerDeliverySelection(`/buy/product/${id}`);
  return <BuyerProductDetailClient tenantProductId={id} />;
}
