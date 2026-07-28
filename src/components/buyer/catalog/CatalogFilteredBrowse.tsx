'use client';

import * as React from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { BuyerEntityChipNav } from '@/components/buyer/catalog/BuyerEntityChipNav';
import { CampaignSummaryBlock } from '@/components/buyer/catalog/CampaignSummaryBlock';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { RecoSection } from '@/components/buyer/catalog/RecoSection';
import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';
import { BuyerCatalogSearchInput } from '@/components/buyer/layout/BuyerCatalogSearchInput';
import { ErrorState } from '@/components/ui/empty-state';
import { useDebounce } from '@/hooks/useDebounce';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  useBuyerBrands,
  useBuyerCatalogList,
  useBuyerCategories,
} from '@/hooks/useBuyerProducts';
import { useBuyerBrandRecos, useBuyerCategoryRecos } from '@/hooks/useBuyerCategoryRecos';
import { useCart } from '@/contexts/BuyerCartContext';
import { BUYER_INFINITE_SCROLL_RATIO } from '@/lib/buyer-ui';

export type CatalogFilteredMode = 'category' | 'brand' | 'list';

interface CatalogFilteredBrowseProps {
  mode: CatalogFilteredMode;
  id: string;
}

export function CatalogFilteredBrowse({ mode, id }: CatalogFilteredBrowseProps): React.ReactNode {
  const posthog = usePostHog();
  const { setCampaignId } = useCart();
  const categoryRecos = useBuyerCategoryRecos(mode === 'category' ? id : '');
  const brandRecos = useBuyerBrandRecos(mode === 'brand' ? id : '');
  const [campaignTitle, setCampaignTitle] = React.useState('Catalog');
  const [campaignTitleResolved, setCampaignTitleResolved] = React.useState(false);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search, 300);
  const searchEventKeyRef = React.useRef<string | null>(null);

  const categoriesQuery = useBuyerCategories();
  const brandsQuery = useBuyerBrands();

  const listQuery = useBuyerCatalogList(mode, id, debouncedSearch);
  const pages = listQuery.data?.pages ?? [];
  const items = React.useMemo(() => pages.flatMap((page) => page.items ?? []), [pages]);
  const hasMore = pages.at(-1)?.has_more ?? false;
  const loading = listQuery.isLoading;
  const error = listQuery.isError;
  const loadingMore = listQuery.isFetchingNextPage;

  const sentinelIndex = getSentinelInsertIndex(items.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: loadingMore,
    onLoadMore: () => { void listQuery.fetchNextPage(); },
  });

  const firstPage = pages[0];
  const campaignMessage = mode === 'list' ? (firstPage?.selected_campaign_message ?? null) : null;
  const campaignValidUntil = mode === 'list' ? (firstPage?.selected_campaign_valid_until ?? null) : null;

  // Bind cart attribution to the campaign route id immediately — don't wait for catalog API.
  React.useEffect(() => {
    if (mode === 'list' && id) {
      setCampaignId(id);
    }
  }, [mode, id, setCampaignId]);

  React.useEffect(() => {
    if (mode !== 'list' || campaignTitleResolved) return;
    const page = pages[0];
    if (!page?.selected_campaign_name) return;
    setCampaignTitle(page.selected_campaign_name);
    setCampaignTitleResolved(true);
    if (page.selected_campaign_id) {
      setCampaignId(page.selected_campaign_id);
    }
  }, [mode, pages, campaignTitleResolved, setCampaignId]);

  React.useEffect(() => {
    if (mode !== 'list') return;
    setCampaignTitle('Catalog');
    setCampaignTitleResolved(false);
  }, [mode, id, retryNonce]);

  React.useEffect(() => {
    if (!posthog || debouncedSearch.length === 0 || listQuery.isFetching) return;
    const key = `${mode}:${id}:${debouncedSearch}:${items.length}:${error ? 'error' : 'ok'}`;
    if (searchEventKeyRef.current === key) return;
    searchEventKeyRef.current = key;
    posthog.capture('buyer_catalog_search_results_viewed', {
      source_surface: 'catalog_filtered_browse',
      browse_mode: mode,
      entity_id: id,
      query_length: debouncedSearch.length,
      result_count: items.length,
      has_more: hasMore,
      status: error ? 'error' : 'success',
    });
  }, [debouncedSearch, error, hasMore, id, items.length, listQuery.isFetching, mode, posthog]);

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

  return (
    <div className="flex min-h-[50dvh] flex-col pb-8">
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
            {mode === 'category' && (categoryRecos.data?.length ?? 0) > 0 ? (
              <div className="pt-1">
                <RecoSection
                  title="Trending in this category"
                  widget="w5_category_trending"
                  items={categoryRecos.data ?? []}
                />
              </div>
            ) : null}
            {mode === 'brand' && (brandRecos.data?.length ?? 0) > 0 ? (
              <div className="pt-1">
                <RecoSection
                  title="Trending in this brand"
                  widget="w6_brand_trending"
                  items={brandRecos.data ?? []}
                />
              </div>
            ) : null}
            {items.length > 0 ? (
              <div className="px-4 pb-3 pt-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-3)]">
                      Browse
                    </p>
                    <h2
                      className="mt-1 text-lg font-semibold text-[var(--fg-1)]"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      All Products
                    </h2>
                  </div>
                  <p className="shrink-0 text-sm text-[var(--fg-3)]">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>
            ) : null}
            <ProductGrid
              items={items}
              loadingMore={loadingMore}
              sentinelIndex={sentinelIndex}
              sentinelRef={sentinelRef}
              showPromotionBadge={mode !== 'list'}
            />
            {items.length === 0 ? (
              <NoProductsFoundState />
            ) : null}
          </>
        )}
      </BuyerDetailShell>
    </div>
  );
}

function NoProductsFoundState(): React.ReactNode {
  return (
    <div className="px-4 py-10">
      <div className="rounded-[20px] border border-[var(--border-1)] bg-[var(--bg-surface)] px-6 py-8 text-center shadow-[0_1px_3px_rgba(34,30,26,0.04)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cream-100)] text-[var(--cream-700)]">
          <SearchX className="h-5 w-5" />
        </div>
        <h2
          className="mt-4 text-lg font-semibold text-[var(--fg-1)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          No products found
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--fg-3)]">
          Try a different search or switch filters to explore more products.
        </p>
        <Link
          href="/buy/catalog"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--teal-500)] px-5 py-2.5 text-sm font-semibold text-[var(--teal-500)] transition-colors hover:bg-[var(--teal-500)] hover:text-white"
        >
          Browse Catalog
        </Link>
      </div>
    </div>
  );
}
