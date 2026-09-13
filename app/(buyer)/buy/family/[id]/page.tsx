import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { BuyerProductFamilyDetailClient } from '@/components/buyer/catalog/BuyerProductFamilyDetailClient';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return storefrontPageTitle('Product');
}

export default async function BuyerProductFamilyPage({ params }: PageProps) {
  const { id } = await params;
  if (!id?.trim()) notFound();
  await requireBuyerDeliverySelection(`/buy/family/${id}`);
  return <BuyerProductFamilyDetailClient productFamilyId={id} />;
}
