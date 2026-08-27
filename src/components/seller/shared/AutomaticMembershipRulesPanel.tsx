'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MultiSelectOverlayField } from '@/components/ui/multi-select-overlay-field';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';
import { PickerFiltersPanel } from '@/components/seller/shared/PickerFiltersPanel';
import { BuyerPickerRow } from '@/components/seller/shared/BuyerPickerRow';
import { ProductPickerRow } from '@/components/seller/shared/ProductPickerRow';
import { useCohortComposerBuyers } from '@/hooks/useCohorts';
import { useProductPickerSearch } from '@/hooks/useProductPicker';
import { useTenantLocationOptions } from '@/hooks/useLocations';
import { useTenantBrands } from '@/hooks/useBrands';
import { useTenantCategories } from '@/hooks/useTenantCategories';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePickerFilterState } from '@/hooks/usePickerFilterState';
import {
  BUYER_ADVANCED_FILTERS,
  BUYER_QUICK_ADVANCED_LINKS,
  BUYER_QUICK_FILTERS,
  PRODUCT_ADVANCED_FILTERS,
  PRODUCT_QUICK_ADVANCED_LINKS,
  PRODUCT_QUICK_FILTERS,
} from '@/lib/picker-filters';
import type { BuyerMembershipRules, ProductMembershipRules } from '@/lib/zod';

const READ_ONLY_NOTE = "Membership is automatic based on the selected filters. Edit the filters above to change who's included.";

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * Automatic-membership rules editor used by both the Add/Edit form sheets and the Details-tab
 * rule editors (Customer Groups, Campaign buyers, Campaign products, Price Lists) --
 * generalizes the search-overlay picker's quick-filter-chip + advanced-accordion model to
 * automatic rules, replacing the older plain-dropdown MembershipFilterPanel (removed) everywhere.
 *
 * The live "N match" count and the review list are the SAME query the manual picker uses
 * (search_cohort_composer_buyers / search_picker_products) -- not a separate preview-count RPC
 * -- so the number shown and the set the trigger opens can
 * never drift apart.
 */
export function AutomaticBuyerMembershipPanel({
  rules,
  onRulesChange,
  disabled,
}: {
  rules: BuyerMembershipRules;
  onRulesChange: (rules: BuyerMembershipRules) => void;
  disabled?: boolean;
}) {
  const filterState = usePickerFilterState(BUYER_QUICK_ADVANCED_LINKS, {
    quickFilters: rules.quick_filters,
    advancedValues: {
      status: rules.status ?? null,
      buyer_app: rules.buyer_app ?? null,
      outstanding: rules.outstanding ?? null,
      sales_location: rules.sales_location_id ?? null,
    },
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const { data: locationOptions = [] } = useTenantLocationOptions(true);
  const advancedFilters = useMemo(
    () => [
      ...BUYER_ADVANCED_FILTERS,
      { key: 'sales_location', label: 'Sales location', options: locationOptions.map((loc) => ({ value: loc.id, label: loc.label })) },
    ],
    [locationOptions],
  );

  const query = useCohortComposerBuyers({
    query: reviewSearch,
    limit: 30,
    quickFilters: filterState.quickFilters as any,
    status: (filterState.advancedValues.status ?? null) as any,
    buyerAppFilter: (filterState.advancedValues.buyer_app ?? null) as any,
    outstandingFilter: (filterState.advancedValues.outstanding ?? null) as any,
    locationId: filterState.advancedValues.sales_location ?? null,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.buyers) ?? [], [query.data?.pages]);
  const total = query.data?.pages[0]?.total ?? 0;
  const { sentinelRef } = useInfiniteScroll({
    hasMore: query.hasNextPage ?? false,
    isLoading: query.isFetchingNextPage,
    rootMargin: '240px',
    onLoadMore: () => {
      void query.fetchNextPage();
    },
  });

  const onRulesChangeRef = useLatest(onRulesChange);
  useEffect(() => {
    onRulesChangeRef.current({
      quick_filters: filterState.quickFilters,
      status: (filterState.advancedValues.status ?? undefined) as BuyerMembershipRules['status'],
      buyer_app: (filterState.advancedValues.buyer_app ?? undefined) as BuyerMembershipRules['buyer_app'],
      outstanding: (filterState.advancedValues.outstanding ?? undefined) as BuyerMembershipRules['outstanding'],
      sales_location_id: filterState.advancedValues.sales_location ?? undefined,
    });
  }, [filterState.quickFilters, filterState.advancedValues, onRulesChangeRef]);

  const isInitialLoading = query.isLoading && rows.length === 0;
  const triggerTitle = isInitialLoading
    ? 'Counting matches…'
    : total === 0
      ? 'No buyers match these filters yet'
      : `${total} buyer${total === 1 ? '' : 's'} match these filters`;

  const filtersPanelNode = (
    <PickerFiltersPanel
      quickFilters={BUYER_QUICK_FILTERS}
      activeQuickFilters={filterState.quickFilters}
      onToggleQuickFilter={filterState.toggleQuickFilter}
      advancedFilters={advancedFilters}
      advancedValues={filterState.advancedValues}
      onAdvancedChange={filterState.setAdvancedFilter}
    />
  );

  return (
    <div className="space-y-4">
      {filtersPanelNode}
      <SearchOverlayPicker
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="Buyers matching filters"
        eyebrow="Automatic membership"
        description="Buyers are added or removed automatically as they start or stop matching these filters."
        triggerTitle={triggerTitle}
        triggerDescription={total > 0 ? 'Tap to review the matching list' : undefined}
        triggerDisabled={disabled || isInitialLoading || total === 0}
        searchValue={reviewSearch}
        onSearchValueChange={setReviewSearch}
        searchPlaceholder="Search buyers…"
        readOnly
        readOnlyNote={READ_ONLY_NOTE}
        filtersPanel={filtersPanelNode}
        footer={(
          <div className="flex items-center justify-end">
            <Button type="button" onClick={() => setReviewOpen(false)}>Close</Button>
          </div>
        )}
      >
        {query.isFetching && rows.length === 0 ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded-[8px] bg-cream-100" />
            ))}
          </div>
        ) : rows.length > 0 ? (
          <div className="space-y-0.5">
            {rows.map((buyer) => (
              <BuyerPickerRow key={buyer.id} buyer={buyer} selected readOnly />
            ))}
            {query.hasNextPage ? <div ref={sentinelRef} className="h-4" /> : null}
          </div>
        ) : (
          <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
            No buyers match this search.
          </p>
        )}
      </SearchOverlayPicker>
    </div>
  );
}

export function AutomaticProductMembershipPanel({
  rules,
  onRulesChange,
  disabled,
}: {
  rules: ProductMembershipRules;
  onRulesChange: (rules: ProductMembershipRules) => void;
  disabled?: boolean;
}) {
  const filterState = usePickerFilterState(PRODUCT_QUICK_ADVANCED_LINKS, {
    quickFilters: rules.quick_filters,
    advancedValues: {
      stock: rules.stock ?? null,
      status: rules.status ?? null,
    },
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [brandIds, setBrandIds] = useState<string[]>(rules.brand_ids ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(rules.category_ids ?? []);

  const { data: brandData } = useTenantBrands();
  const { data: categoryData } = useTenantCategories();
  const brandItems = useMemo(
    () => (brandData?.brands ?? []).map((brand) => ({
      id: brand.id,
      value: brand.display_name_override ?? brand.master_brand?.name ?? 'Unnamed brand',
      title: brand.display_name_override ?? brand.master_brand?.name ?? 'Unnamed brand',
    })),
    [brandData],
  );
  const categoryItems = useMemo(
    () => (categoryData?.categories ?? []).map((category) => ({ id: category.id, value: category.name, title: category.name })),
    [categoryData],
  );

  const query = useProductPickerSearch({
    query: reviewSearch,
    limit: 30,
    brandIds,
    categoryIds,
    stockBucket: (filterState.advancedValues.stock ?? null) as any,
    status: (filterState.advancedValues.status ?? null) as any,
    quickFilters: filterState.quickFilters,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.products) ?? [], [query.data?.pages]);
  const total = query.data?.pages[0]?.total ?? 0;
  const { sentinelRef } = useInfiniteScroll({
    hasMore: query.hasNextPage ?? false,
    isLoading: query.isFetchingNextPage,
    rootMargin: '240px',
    onLoadMore: () => {
      void query.fetchNextPage();
    },
  });

  const onRulesChangeRef = useLatest(onRulesChange);
  const rulesRef = useLatest(rules);
  useEffect(() => {
    onRulesChangeRef.current({
      ...rulesRef.current,
      quick_filters: filterState.quickFilters,
      stock: (filterState.advancedValues.stock ?? undefined) as ProductMembershipRules['stock'],
      status: (filterState.advancedValues.status ?? undefined) as ProductMembershipRules['status'],
      brand_ids: brandIds,
      category_ids: categoryIds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState.quickFilters, filterState.advancedValues, brandIds, categoryIds, onRulesChangeRef]);

  const isInitialLoading = query.isLoading && rows.length === 0;
  const triggerTitle = isInitialLoading
    ? 'Counting matches…'
    : total === 0
      ? 'No products match these filters yet'
      : `${total} product${total === 1 ? '' : 's'} match these filters`;

  const filtersPanelNode = (
    <PickerFiltersPanel
      quickFilters={PRODUCT_QUICK_FILTERS}
      activeQuickFilters={filterState.quickFilters}
      onToggleQuickFilter={filterState.toggleQuickFilter}
      advancedFilters={PRODUCT_ADVANCED_FILTERS}
      advancedValues={filterState.advancedValues}
      onAdvancedChange={filterState.setAdvancedFilter}
    />
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-cream-800">Brand</p>
          <MultiSelectOverlayField
            items={brandItems}
            selectedIds={brandIds}
            onChange={setBrandIds}
            title="Select brands"
            emptySelectionLabel="All brands"
            searchPlaceholder="Search brands…"
            countNoun="brands"
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-cream-800">Category</p>
          <MultiSelectOverlayField
            items={categoryItems}
            selectedIds={categoryIds}
            onChange={setCategoryIds}
            title="Select categories"
            emptySelectionLabel="All categories"
            searchPlaceholder="Search categories…"
            countNoun="categories"
          />
        </div>
      </div>
      {filtersPanelNode}
      <SearchOverlayPicker
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="Products matching filters"
        eyebrow="Automatic membership"
        description="Products are added or removed automatically as they start or stop matching these filters."
        triggerTitle={triggerTitle}
        triggerDescription={total > 0 ? 'Tap to review the matching list' : undefined}
        triggerDisabled={disabled || isInitialLoading || total === 0}
        searchValue={reviewSearch}
        onSearchValueChange={setReviewSearch}
        searchPlaceholder="Search products, SKU, or brand…"
        readOnly
        readOnlyNote={READ_ONLY_NOTE}
        filtersPanel={filtersPanelNode}
        footer={(
          <div className="flex items-center justify-end">
            <Button type="button" onClick={() => setReviewOpen(false)}>Close</Button>
          </div>
        )}
      >
        {query.isFetching && rows.length === 0 ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded-[8px] bg-cream-100" />
            ))}
          </div>
        ) : rows.length > 0 ? (
          <div className="space-y-0.5">
            {rows.map((product) => (
              <ProductPickerRow key={product.id} product={product} selected readOnly />
            ))}
            {query.hasNextPage ? <div ref={sentinelRef} className="h-4" /> : null}
          </div>
        ) : (
          <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
            No products match this search.
          </p>
        )}
      </SearchOverlayPicker>
    </div>
  );
}
