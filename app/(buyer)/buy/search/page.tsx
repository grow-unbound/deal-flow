import { BuyerSearchPageClient } from '@/components/buyer/search/BuyerSearchPageClient';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';
import type { Metadata } from 'next';

export const metadata: Metadata = storefrontPageTitle('Search');

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildReturnTo(params: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) sp.append(key, item);
      }
      continue;
    }
    if (value) sp.set(key, value);
  }
  const query = sp.toString();
  return query ? `/buy/search?${query}` : '/buy/search';
}

export default async function BuyerSearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const scope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  if ((scope ?? 'catalog') === 'catalog') {
    await requireBuyerDeliverySelection(buildReturnTo(params));
  }
  return <BuyerSearchPageClient />;
}
