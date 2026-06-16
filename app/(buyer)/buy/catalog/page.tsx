import { Suspense } from 'react';
import { CatalogDiscoveryLanding } from '@/components/buyer/catalog/CatalogDiscoveryLanding';
import { CatalogShareTokenView } from './CatalogShareTokenView';

type CatalogPageProps = {
  searchParams: Promise<{ share_token?: string | string[] }>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
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
