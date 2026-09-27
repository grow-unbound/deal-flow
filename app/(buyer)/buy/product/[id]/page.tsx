import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BuyerProductDetailClient } from '@/components/buyer/catalog/BuyerProductDetailClient';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { loadBuyerProductTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await loadBuyerProductTitle(id);
  return storefrontPageTitle(name ?? 'Product');
}

export default async function BuyerProductPage({ params }: PageProps) {
  const { id } = await params;
  if (!id?.trim()) notFound();
  await requireBuyerDeliverySelection(`/buy/product/${id}`);
  return <BuyerProductDetailClient tenantProductId={id} />;
}
