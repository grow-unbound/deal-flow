import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BuyerProductDetailClient } from '@/components/buyer/catalog/BuyerProductDetailClient';
import { loadBuyerProductTitleForTenant } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';
import { resolveStorefrontTenantBySlug } from '@/lib/server/resolve-storefront-tenant';

export const revalidate = 120;
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ tenantSlug: string; id: string }>;
};

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantSlug, id } = await params;
  const storefront = await resolveStorefrontTenantBySlug(tenantSlug);
  const name = storefront ? await loadBuyerProductTitleForTenant(storefront.tenantId, id) : null;
  return storefrontPageTitle(name ?? 'Product');
}

export default async function BuyerGuestProductPage({ params }: PageProps) {
  const { id } = await params;
  if (!id?.trim()) notFound();
  return <BuyerProductDetailClient tenantProductId={id} />;
}
