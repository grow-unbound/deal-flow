import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { BuyerProductFamilyDetailClient } from '@/components/buyer/catalog/BuyerProductFamilyDetailClient';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

export const revalidate = 120;
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ tenantSlug: string; id: string }>;
};

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(): Promise<Metadata> {
  return storefrontPageTitle('Product');
}

export default async function BuyerGuestProductFamilyPage({ params }: PageProps) {
  const { id } = await params;
  if (!id?.trim()) notFound();
  return <BuyerProductFamilyDetailClient productFamilyId={id} />;
}
