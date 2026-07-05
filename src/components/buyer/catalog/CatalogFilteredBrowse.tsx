'use client';

import * as React from 'react';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { BuyerEntityChipNav } from '@/components/buyer/catalog/BuyerEntityChipNav';
import { CampaignSummaryBlock } from '@/components/buyer/catalog/CampaignSummaryBlock';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';
import { BuyerCatalogSearchInput } from '@/components/buyer/layout/BuyerCatalogSearchInput';
import { ErrorState } from '@/components/ui/empty-state';
import { useDebounce } from '@/hooks/useDebounce';
import {
  useBuyerBrands,
  useBuyerCatalogList,
  useBuyerCategories,
} from '@/hooks/useBuyerProducts';

export type CatalogFilteredMode = 'category' | 'brand' | 'list';

interface CatalogFilteredBrowseProps {
  mode: CatalogFilteredMode;
  id: string;
}

export function CatalogFilteredBrowse({ mode, id }: CatalogFilteredBrowseProps): React.ReactNode {
  const [campaignTitle, setCampaignTitle] = React.useState('Catalog');
  const [campaignTitleResolved, setCampaignTitleResolved] = React.useState(false);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search, 300);

  const categoriesQuery = useBuyerCategories();
  const brandsQuery = useBuyerBrands();

  const listQuery = useBuyerCatalogList(mode, id, debouncedSearch);
  const pages = listQuery.data?.pages ?? [];
  const items = React.useMemo(() => pages.flatMap((page) => page.items ?? []), [pages]);
  const hasMore = pages.at(-1)?.has_more ?? false;
  const loading = listQuery.isLoading;
  const error = listQuery.isError;
  const loadingMore = listQuery.isFetchingNextPage;

  const firstPage = pages[0];
  const campaignMessage = mode === 'list' ? (firstPage?.selected_campaign_message ?? null) : null;
  const campaignValidUntil = mode === 'list' ? (firstPage?.selected_campaign_valid_until ?? null) : null;

  React.useEffect(() => {
    if (mode !== 'list' || campaignTitleResolved) return;
    const page = pages[0];
    if (!page?.selected_campaign_name) return;
    setCampaignTitle(page.selected_campaign_name);
    setCampaignTitleResolved(true);
  }, [mode, pages, campaignTitleResolved]);

  React.useEffect(() => {
    if (mode !== 'list') return;
    setCampaignTitle('Catalog');
    setCampaignTitleResolved(false);
  }, [mode, id, retryNonce]);

  const title = mode === 'category' ? 'Category' : mode === 'brand' ? 'Brand' : campaignTitle;

  const stickyToolbar =
    mode === 'category' ? (
      <BuyerEntityChipNav
        kind="category"
        categories={categoriesQuery.data ?? []}
        selectedId={id}
        mode="detail"
      />
    ) : mode === 'brand' ? (
      <BuyerEntityChipNav
        kind="brand"
        brands={brandsQuery.data ?? []}
        selectedId={id}
        mode="detail"
      />
    ) : null;

  function handleLoadMore(): void {
    if (!hasMore || loadingMore) return;
    void listQuery.fetchNextPage();
  }

  return (
    <div className="flex min-h-[50vh] flex-col pb-8">
      <BuyerDetailShell
        title={title}
        hideSearch
        headerSearch={
          <BuyerCatalogSearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Search ${mode === 'brand' ? 'products in this brand' : 'products in this category'}`}
          />
        }
        stickyToolbar={stickyToolbar}
      >
        {loading ? (
          <LoadingSkeleton count={6} />
        ) : error ? (
          <div className="p-4">
            <ErrorState
              heading="Couldn't load products"
              description="Check your connection and try again."
              onRetry={() => {
                setRetryNonce((n) => n + 1);
                void listQuery.refetch();
              }}
            />
          </div>
        ) : (
          <>
            {mode === 'list' ? (
              <CampaignSummaryBlock message={campaignMessage} validUntil={campaignValidUntil} />
            ) : null}
            <div className="px-2">
              <ProductGrid items={items} />
            </div>
            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm" style={{ color: 'var(--fg-3)' }}>
                No products found.
              </p>
            ) : null}
            {hasMore ? (
              <div className="px-2 pb-6">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-60"
                  style={{ borderColor: 'var(--border-1)', background: 'var(--bg-surface)', color: 'var(--fg-2)' }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </BuyerDetailShell>
    </div>
  );
}
