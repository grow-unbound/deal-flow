import { Suspense } from 'react';
import { CatalogDiscoveryLanding } from '@/components/buyer/catalog/CatalogDiscoveryLanding';

export const revalidate = 120;

/**
 * Guest ISR home shell (plan #4). No searchParams here deliberately — reading
 * searchParams in a Server Component is itself a dynamic API, and this tree
 * never needs to (share_token / campaign flows are excluded from the ISR
 * rewrite in middleware and keep using the existing dynamic /buy/home page).
 * CatalogDiscoveryLanding is a 'use client' component that fetches its own
 * data client-side (matches how the existing dynamic home page already
 * behaves for a guest — SSR-embedded initial data there is buyer-only too).
 *
 * CatalogDiscoveryLanding itself calls useSearchParams() internally (for its
 * own client-side filter state) with no Suspense boundary of its own — a
 * pre-existing latent issue that never mattered on the always-dynamic
 * app/(buyer)/buy/home page, since useSearchParams()'s static-render bailout
 * only triggers when a page is actually being statically/ISR-rendered. This
 * is the first static/ISR render path that exercises it, so it needs the
 * Suspense boundary explicitly here.
 */
export default function BuyerGuestHomePage() {
  return (
    <Suspense fallback={null}>
      <CatalogDiscoveryLanding />
    </Suspense>
  );
}
