import { Suspense } from 'react';
import { preload } from 'react-dom';
import { CatalogDiscoveryLanding } from '@/components/buyer/catalog/CatalogDiscoveryLanding';
import { BuyerSelectionGate } from '@/components/buyer/layout/BuyerSelectionGate';
import { CatalogShareTokenView } from './CatalogShareTokenView';
import { getBuyerServerClaims } from '@/lib/server/buyer-server-claims';
import { loadBuyerHomePromotions } from '@/lib/server/buyer-home-promotions';
import { loadBuyerHomeReco } from '@/lib/server/buyer-home-reco';
import { getBuyerServerProductScope } from '@/lib/server/buyer-server-product-scope';
import { fetchBuyerBrands, fetchBuyerCategories } from '@/lib/server/buyer-product-data';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerHomePromotionsResponse, BuyerHomeRecoResponse } from '@/lib/buyer-home-types';
import type { BuyerBrand, BuyerCategory } from '@/types/buyer';

type CatalogInitialData = {
  promotions?: BuyerHomePromotionsResponse;
  reco?: BuyerHomeRecoResponse;
  brands?: BuyerBrand[];
  categories?: BuyerCategory[];
};

async function loadInitialCatalogData(): Promise<CatalogInitialData> {
  if (!supabaseAdmin) return {};
  const claims = await getBuyerServerClaims();
  if (!claims.tenant_id || !claims.buyer_id) return {};
  const db = supabaseAdmin;
  const tenantId = claims.tenant_id;
  const buyerId = claims.buyer_id;

  const [promotions, reco, scope] = await Promise.all([
    loadBuyerHomePromotions(db, tenantId, buyerId).catch((error) => {
      console.error('[CatalogPage] SSR promotions preload failed, falling back to client fetch', error);
      return undefined;
    }),
    loadBuyerHomeReco(db, tenantId, buyerId).catch((error) => {
      console.error('[CatalogPage] SSR reco preload failed, falling back to client fetch', error);
      return undefined;
    }),
    getBuyerServerProductScope(db, tenantId, buyerId).catch((error) => {
      console.error('[CatalogPage] SSR product scope resolve failed, falling back to client fetch', error);
      return null;
    }),
  ]);

  if (!scope) return { promotions, reco };

  const [brands, categories] = await Promise.all([
    fetchBuyerBrands({ db, tenantId, allowedTenantBrandIds: scope.allowedTenantBrandIds }).catch((error) => {
      console.error('[CatalogPage] SSR brands preload failed, falling back to client fetch', error);
      return undefined;
    }),
    fetchBuyerCategories({ db, tenantId, allowedTenantBrandIds: scope.allowedTenantBrandIds }).catch((error) => {
      console.error('[CatalogPage] SSR categories preload failed, falling back to client fetch', error);
      return undefined;
    }),
  ]);

  return { promotions, reco, brands, categories };
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

  const { promotions, reco, brands, categories } = await loadInitialCatalogData();
  const heroImageUrl = promotions?.latest_promotions_preview[0]?.hero_image_url;
  if (heroImageUrl) preload(heroImageUrl, { as: 'image' });

  return (
    <BuyerSelectionGate returnTo={returnTo}>
      <CatalogDiscoveryLanding
        initialPromotions={promotions}
        initialReco={reco}
        initialBrands={brands}
        initialCategories={categories}
      />
    </BuyerSelectionGate>
  );
}
