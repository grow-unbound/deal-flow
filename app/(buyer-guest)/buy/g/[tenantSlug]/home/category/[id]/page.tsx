import type { Metadata } from 'next';
import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';
import { loadBuyerCategoryTitleForTenant } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';
import { resolveStorefrontTenantBySlug } from '@/lib/server/resolve-storefront-tenant';

export const revalidate = 120;
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ tenantSlug: string; id: string }>;
};

// See layout.tsx comment: generateStaticParams (even empty) is required to
// register this dynamic segment as ISR-eligible at all.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantSlug, id } = await params;
  const storefront = await resolveStorefrontTenantBySlug(tenantSlug);
  const name = storefront ? await loadBuyerCategoryTitleForTenant(storefront.tenantId, id) : null;
  return storefrontPageTitle(name ?? 'Category');
}

export default async function BuyerGuestCategoryPage({ params }: PageProps) {
  const { id } = await params;
  return <CatalogFilteredBrowse mode="category" id={id} />;
}
