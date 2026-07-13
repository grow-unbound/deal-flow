'use client';

import * as React from 'react';

import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { ErrorState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-fetch';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import type { BuyerPromotionSummary } from '@/types/buyer';

interface PromotionsResponse {
  catalogs: BuyerPromotionSummary[];
}

export default function PromotionsPage() {
  const { state, setState } = useRouteSnapshot({
    storageKey: 'buyer-promotions-page',
    initialState: {
      promotions: null as BuyerPromotionSummary[] | null,
    },
  });
  const promotions = state.promotions;
  const [loading, setLoading] = React.useState(!promotions);
  const [error, setError] = React.useState(false);

  useRouteScrollRestoration({
    storageKey: 'buyer-promotions-page',
    ready: !loading,
  });

  React.useEffect(() => {
    if (promotions) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setError(false);
    apiFetch('/api/buyer/catalogs')
      .then((response) => response.json() as Promise<PromotionsResponse>)
      .then((data) => {
        if (cancelled) return;
        setState((current) => ({ ...current, promotions: data.catalogs ?? [] }));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [promotions, setState]);

  return (
    <div className="flex min-h-[50vh] flex-col pb-[var(--tab-bar)]">
      <BuyerDetailShell title="Promotions">
        {loading ? (
          <div className="space-y-3 px-4 py-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
                <div className="buyer-lookbook-preview w-full animate-pulse bg-cream-100" />
                <div className="space-y-2 bg-cream-50 px-4 py-3">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState
              heading="Couldn't load promotions"
              description="Check your connection and try again."
              onRetry={() => {
                setState((current) => ({ ...current, promotions: null }));
                setLoading(true);
                setError(false);
              }}
            />
          </div>
        ) : promotions && promotions.length > 0 ? (
          <div className="space-y-3 px-4 py-4">
            {promotions.map((promotion, index) => (
              <CatalogLookbookCard
                key={promotion.id}
                id={promotion.id}
                name={promotion.name}
                productCount={promotion.product_count}
                href={`/buy/catalog/list/${promotion.id}`}
                validUntil={promotion.valid_until}
                heroImageUrl={promotion.hero_image_url}
                hueIndex={index}
                layout="list"
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">No promotions are live right now.</div>
        )}
      </BuyerDetailShell>
    </div>
  );
}
