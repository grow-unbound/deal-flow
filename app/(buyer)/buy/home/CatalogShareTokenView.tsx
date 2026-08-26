'use client';

import * as React from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { BuyerCatalogSearchInput } from '@/components/buyer/layout/BuyerCatalogSearchInput';
import { BuyerCatalogDesktopLayout } from '@/components/buyer/catalog/BuyerCatalogDesktopLayout';
import { CampaignSummaryBlock } from '@/components/buyer/catalog/CampaignSummaryBlock';
import { CatalogSearchState } from '@/components/buyer/catalog/CatalogSearchState';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useDebounce } from '@/hooks/useDebounce';
import { useCart } from '@/contexts/BuyerCartContext';
import { ErrorState } from '@/components/ui/empty-state';
import type { BuyerCatalogItem } from '@/types/buyer';

export function CatalogShareTokenView({ shareToken }: { shareToken: string }) {
  const { setCampaignId } = useCart();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'buyer-catalog-share-token-page',
    initialState: {
      search: '',
      items: [] as BuyerCatalogItem[],
      shareCatalogName: null as string | null,
      shareCatalogMessage: null as string | null,
      shareCatalogValidUntil: null as string | null,
      loadedShareToken: null as string | null,
    },
  });
  const search = routeState.search;
  const items = routeState.items;
  const shareCatalogName = routeState.shareCatalogName;
  const shareCatalogMessage = routeState.shareCatalogMessage;
  const shareCatalogValidUntil = routeState.shareCatalogValidUntil;
  const loadedShareToken = routeState.loadedShareToken;
  const [loading, setLoading] = React.useState(items.length === 0);
  const [listFetchError, setListFetchError] = React.useState(false);
  const [catalogFetchNonce, setCatalogFetchNonce] = React.useState(0);
  const debouncedSearch = useDebounce(search, 300);

  useRouteScrollRestoration({
    storageKey: 'buyer-catalog-share-token-page',
    ready: !loading,
  });

  // Single fetch — the share_token catalog API returns the whole campaign's
  // items in one response (no pagination, no server-side search); filtering
  // below is client-side over the already-loaded list.
  React.useEffect(() => {
    let cancelled = false;
    setListFetchError(false);
    setLoading(items.length === 0);

    apiFetch(`/api/buyer/catalog/${shareToken}`)
      .then((r) => r.json() as Promise<{ campaign_id?: string; name?: string; message?: string | null; valid_until?: string | null; items?: BuyerCatalogItem[] }>)
      .then((data) => {
        if (cancelled) return;
        setRouteState((current) => ({
          ...current,
          items: data.items ?? [],
          shareCatalogName: data.name ?? 'Catalog',
          shareCatalogMessage: data.message ?? null,
          shareCatalogValidUntil: data.valid_until ?? null,
          loadedShareToken: shareToken,
        }));
        if (data.campaign_id) {
          setCampaignId(data.campaign_id);
        }
      })
      .catch(() => {
        if (!cancelled) setListFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken, catalogFetchNonce, setRouteState]);

  React.useEffect(() => {
    if (loadedShareToken === shareToken) return;
    setRouteState((current) => ({
      ...current,
      items: [],
      shareCatalogName: null,
      shareCatalogMessage: null,
      shareCatalogValidUntil: null,
      loadedShareToken: null,
    }));
  }, [loadedShareToken, setRouteState, shareToken]);

  const filteredItems = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.display_name.toLowerCase().includes(q) || item.internal_sku.toLowerCase().includes(q),
    );
  }, [items, debouncedSearch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BuyerDetailShell
        title={shareCatalogName ?? 'Campaign'}
        hideDesktopHeader
        backFallbackHref="/buy/home"
        headerSearch={
          <BuyerCatalogSearchInput
            value={search}
            onChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
            placeholder="Search products in this catalog"
          />
        }
      >
        <BuyerCatalogDesktopLayout>
          <div className="hidden px-2 pt-5 md:block lg:px-2 lg:pt-6">
            <div className="flex items-center gap-3">
              <BuyerCatalogSearchInput
                value={search}
                onChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
                placeholder="Search products in this catalog"
                className="max-w-[34rem]"
              />
            </div>
          </div>

          <CampaignSummaryBlock message={shareCatalogMessage} validUntil={shareCatalogValidUntil} />

          {listFetchError && items.length === 0 ? (
            <div className="p-4">
              <ErrorState
                heading="Couldn't load catalog"
                description="Check your connection and try again."
                onRetry={() => setCatalogFetchNonce((n) => n + 1)}
              />
            </div>
          ) : (
            <>
              {listFetchError && items.length > 0 ? (
                <div className="p-4">
                  <ErrorState
                    heading="Couldn't refresh results"
                    description="Showing the previous list. Try again to update."
                    onRetry={() => setCatalogFetchNonce((n) => n + 1)}
                  />
                </div>
              ) : null}

              {loading || filteredItems.length > 0 ? (
                <div className="px-4 pb-3 pt-4 lg:px-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-3)]">
                    Browse
                  </p>
                  <h2
                    className="mt-1 text-base font-semibold text-[var(--fg-1)]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    All Products
                  </h2>
                </div>
              ) : null}

              <ProductGrid items={filteredItems} loading={loading} showPromotionBadge={false} />

              {!loading && filteredItems.length === 0 ? <NoProductsFoundState /> : null}
            </>
          )}
        </BuyerCatalogDesktopLayout>
      </BuyerDetailShell>
    </div>
  );
}

function NoProductsFoundState(): React.ReactNode {
  return (
    <CatalogSearchState
      icon={<SearchX className="h-5 w-5" />}
      title="No products found"
      description="Try a different search."
      action={(
        <Link
          href="/buy/home"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--teal-500)] px-5 py-2.5 text-sm font-semibold text-[var(--teal-500)] transition-colors hover:bg-[var(--teal-500)] hover:text-white"
        >
          Browse Catalog
        </Link>
      )}
    />
  );
}
