'use client';

import * as React from 'react';
import Link from 'next/link';

import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { ErrorState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-fetch';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import type { BuyerPromotionSummary } from '@/types/buyer';

interface PromotionsResponse {
  catalogs: BuyerPromotionSummary[];
}

function formatValidUntil(iso: string | null): string {
  if (!iso) return 'No end date';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PROMO_HUES = [
  'linear-gradient(135deg, #1F3A34 0%, #2D5549 100%)',
  'linear-gradient(135deg, #874720 0%, #C26E3A 100%)',
  'linear-gradient(135deg, #6B6760 0%, #3D3A35 100%)',
];

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
              <div key={index} className="overflow-hidden rounded-2xl border border-cream-200 bg-cream-100">
                <div className="h-24 animate-pulse bg-cream-100" />
                <div className="space-y-2 bg-cream-50 px-4 py-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-cream-200" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-cream-200" />
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
              <Link
                key={promotion.id}
                href={`/buy/catalog/list/${promotion.id}`}
                onClick={() => markBuyerNavigationForward()}
                className="block overflow-hidden rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface)] no-underline"
              >
                <div className="h-24 px-4 py-4" style={{ background: PROMO_HUES[index % PROMO_HUES.length] }}>
                  <h2 className="font-[var(--font-display)] text-lg font-semibold leading-tight text-white">
                    {promotion.name}
                  </h2>
                </div>
                <div className="flex items-center justify-between bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--fg-2)]">
                  <span><strong className="font-medium text-[var(--fg-1)]">{promotion.product_count}</strong> products</span>
                  <span>{formatValidUntil(promotion.valid_until)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-3)]">No promotions are live right now.</div>
        )}
      </BuyerDetailShell>
    </div>
  );
}
