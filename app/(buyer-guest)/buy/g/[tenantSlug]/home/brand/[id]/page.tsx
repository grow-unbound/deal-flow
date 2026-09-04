import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { loadBuyerBrandTitleForTenant } from '@/lib/server/buyer-page-titles';
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
  const name = storefront ? await loadBuyerBrandTitleForTenant(storefront.tenantId, id) : null;
  return storefrontPageTitle(name ?? 'Brand');
}

export default async function BuyerGuestBrandPage({ params }: PageProps) {
  const { id } = await params;
  return <CatalogFilteredBrowse mode="brand" id={id} />;
}
