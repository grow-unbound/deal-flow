import { Suspense } from 'react';
import { preload } from 'react-dom';
import { CatalogDiscoveryLanding } from '@/components/buyer/catalog/CatalogDiscoveryLanding';
import { BuyerSelectionGate } from '@/components/buyer/layout/BuyerSelectionGate';
import { CatalogShareTokenView } from './CatalogShareTokenView';
import { getBuyerServerClaims } from '@/lib/server/buyer-server-claims';
import { loadBuyerHomePromotions } from '@/lib/server/buyer-home-promotions';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerHomePromotionsResponse } from '@/lib/buyer-home-types';

async function loadInitialPromotions(): Promise<BuyerHomePromotionsResponse | undefined> {
  if (!supabaseAdmin) return undefined;
  const claims = await getBuyerServerClaims();
  if (!claims.tenant_id || !claims.buyer_id) return undefined;
  try {
    return await loadBuyerHomePromotions(supabaseAdmin, claims.tenant_id, claims.buyer_id);
  } catch (error) {
    console.error('[CatalogPage] SSR promotions preload failed, falling back to client fetch', error);
    return undefined;
  }
}

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
  const returnTo = search.toString() ? `/buy/home?${search.toString()}` : '/buy/home';
  const raw = params.share_token;
  const shareToken = Array.isArray(raw) ? raw[0] : raw;

  if (shareToken) {
    return (
      <BuyerSelectionGate returnTo={returnTo}>
        <Suspense fallback={null}>
          <CatalogShareTokenView shareToken={shareToken} />
        </Suspense>
      </BuyerSelectionGate>
    );
  }

  const initialPromotions = await loadInitialPromotions();
  const heroImageUrl = initialPromotions?.latest_promotions_preview[0]?.hero_image_url;
  if (heroImageUrl) preload(heroImageUrl, { as: 'image' });

  return (
    <BuyerSelectionGate returnTo={returnTo}>
      <CatalogDiscoveryLanding initialPromotions={initialPromotions} />
    </BuyerSelectionGate>
  );
}
