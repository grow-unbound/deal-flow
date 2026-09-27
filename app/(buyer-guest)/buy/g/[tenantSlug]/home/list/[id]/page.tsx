import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

export const revalidate = 120;
export const dynamicParams = true;

export const metadata: Metadata = storefrontPageTitle('Catalog');

type PageProps = {
  params: Promise<{ tenantSlug: string; id: string }>;
};

export async function generateStaticParams() {
  return [];
}

export default async function BuyerGuestListPage({ params }: PageProps) {
  const { id } = await params;
  return <CatalogFilteredBrowse mode="list" id={id} />;
}
