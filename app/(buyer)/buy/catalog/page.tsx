import { Suspense } from 'react';
import { CatalogDiscoveryLanding } from '@/components/buyer/catalog/CatalogDiscoveryLanding';
import { requireBuyerDeliverySelection } from '@/lib/server/buyer-location-selection';
import { CatalogShareTokenView } from './CatalogShareTokenView';

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) search.append(key, item);
      }
      continue;
    }
    if (value) search.set(key, value);
  }
  const returnTo = search.toString() ? `/buy/catalog?${search.toString()}` : '/buy/catalog';
  await requireBuyerDeliverySelection(returnTo);
  const raw = params.share_token;
  const shareToken = Array.isArray(raw) ? raw[0] : raw;

  if (shareToken) {
    return (
      <Suspense fallback={null}>
        <CatalogShareTokenView shareToken={shareToken} />
      </Suspense>
    );
  }

  return <CatalogDiscoveryLanding />;
}
