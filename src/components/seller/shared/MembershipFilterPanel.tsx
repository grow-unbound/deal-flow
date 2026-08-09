'use client';

import { useMemo } from 'react';
import { MultiSelectOverlayField } from '@/components/ui/multi-select-overlay-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMembershipPreviewCount } from '@/hooks/useMembershipPreviewCount';
import { useTenantBrands } from '@/hooks/useBrands';
import { useTenantCategories } from '@/hooks/useTenantCategories';
import type {
  BuyerMembershipRules,
  MembershipEntityType,
  ProductMembershipRules,
} from '@/lib/zod';

const DEMAND_THIS_QUARTER_OPTIONS = [
  { value: 'has_demand', label: 'Has demand' },
  { value: 'no_demand', label: 'No demand' },
];

const INVOICE_THIS_QUARTER_OPTIONS = [
  { value: 'purchased', label: 'Purchased' },
  { value: 'not_purchased', label: 'Not purchased' },
];

const BUYER_APP_STATUS_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'not_enabled', label: 'Not enabled' },
  { value: 'inactive', label: 'Inactive' },
];

const STOCK_STATUS_OPTIONS = [
  { value: 'new_stock', label: 'New stock' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

const SALES_THIS_QUARTER_OPTIONS = [
  { value: 'sold', label: 'Sold' },
  { value: 'not_sold', label: 'Not sold' },
];

const isBuyerEntity = (entityType: MembershipEntityType) => entityType === 'cohort' || entityType === 'campaign_buyers';

interface MembershipFilterPanelProps {
  entityType: MembershipEntityType;
  rules: BuyerMembershipRules | ProductMembershipRules;
  onRulesChange: (rules: BuyerMembershipRules | ProductMembershipRules) => void;
  disabled?: boolean;
}

/**
 * Shared Automatic-membership filter body: fixed single-value segmented controls for the
 * buyer/product buckets, plus Brand/Category stacked-overlay multi-select for products, plus
 * a live match count. Appears twice per entity (Create/Edit overlay and Details tab) per
 * requirement 5 -- this component is exactly that shared piece. The mode switch itself
 * (Manual <-> Automatic) is NOT rendered here; callers render it only in the Edit overlay
 * (requirement 6) and pass the resulting rules down once Automatic is selected.
 */
export function MembershipFilterPanel({ entityType, rules, onRulesChange, disabled }: MembershipFilterPanelProps) {
  const preview = useMembershipPreviewCount(entityType, rules);

  if (isBuyerEntity(entityType)) {
    const buyerRules = rules as BuyerMembershipRules;
    const setBuyerRule = <K extends keyof BuyerMembershipRules>(key: K, value: BuyerMembershipRules[K] | undefined) => {
      onRulesChange({ ...buyerRules, [key]: value });
    };

    return (
      <div className="space-y-4">
        <FilterRow label="Demand this quarter">
          <Select
            value={buyerRules.demand_status_this_quarter ?? '__all__'}
            onValueChange={(value) => setBuyerRule('demand_status_this_quarter', value === '__all__' ? undefined : value as BuyerMembershipRules['demand_status_this_quarter'])}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="All buyers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All buyers</SelectItem>
              {DEMAND_THIS_QUARTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterRow>
        <FilterRow label="Invoices this quarter">
          <Select
            value={buyerRules.invoice_status_this_quarter ?? '__all__'}
            onValueChange={(value) => setBuyerRule('invoice_status_this_quarter', value === '__all__' ? undefined : value as BuyerMembershipRules['invoice_status_this_quarter'])}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="All invoice states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All invoice states</SelectItem>
              {INVOICE_THIS_QUARTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterRow>
        <FilterRow label="Buyer app status">
          <Select
            value={buyerRules.buyer_app_status ?? '__all__'}
            onValueChange={(value) => setBuyerRule('buyer_app_status', value === '__all__' ? undefined : value as BuyerMembershipRules['buyer_app_status'])}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="All app statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All app statuses</SelectItem>
              {BUYER_APP_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterRow>
        <LiveCount
          isLoading={preview.isLoading}
          isRefreshing={preview.isRefreshingPreview}
          count={preview.data?.count}
          sampleNames={preview.data?.sample_names}
          noun="buyers"
        />
      </div>
    );
  }

  const productRules = rules as ProductMembershipRules;
  const setProductRule = <K extends keyof ProductMembershipRules>(key: K, value: ProductMembershipRules[K]) => {
    onRulesChange({ ...productRules, [key]: value });
  };
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

  return (
    <div className="space-y-4">
      <FilterRow label="Brand">
        <MultiSelectOverlayField
          items={brandItems}
          selectedIds={productRules.brand_names ?? []}
          onChange={(ids) => setProductRule('brand_names', ids)}
          title="Select brands"
          emptySelectionLabel="All brands"
          searchPlaceholder="Search brands…"
          countNoun="brands"
        />
      </FilterRow>
      <FilterRow label="Category">
        <MultiSelectOverlayField
          items={categoryItems}
          selectedIds={productRules.category_names ?? []}
          onChange={(ids) => setProductRule('category_names', ids)}
          title="Select categories"
          emptySelectionLabel="All categories"
          searchPlaceholder="Search categories…"
          countNoun="categories"
        />
      </FilterRow>
      <FilterRow label="Stock status">
        <Select
          value={productRules.stock_status ?? '__all__'}
          onValueChange={(value) => setProductRule('stock_status', value === '__all__' ? undefined : value as ProductMembershipRules['stock_status'])}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="All stock states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All stock states</SelectItem>
            {STOCK_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow label="Sales this quarter">
        <Select
          value={productRules.sales_status_this_quarter ?? '__all__'}
          onValueChange={(value) => setProductRule('sales_status_this_quarter', value === '__all__' ? undefined : value as ProductMembershipRules['sales_status_this_quarter'])}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="All sales states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sales states</SelectItem>
            {SALES_THIS_QUARTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <LiveCount
        isLoading={preview.isLoading}
        isRefreshing={preview.isRefreshingPreview}
        count={preview.data?.count}
        sampleNames={preview.data?.sample_names}
        noun="products"
      />
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-cream-800">{label}</p>
      {children}
    </div>
  );
}

function LiveCount({
  isLoading,
  isRefreshing,
  count,
  sampleNames,
  noun,
}: {
  isLoading: boolean;
  isRefreshing: boolean;
  count: number | undefined;
  sampleNames: string[] | undefined;
  noun: string;
}) {
  const showLoadingOnly = isLoading && count === undefined;

  return (
    <div className="rounded-[10px] border border-cream-300 bg-cream-100 px-3 py-2.5">
      {showLoadingOnly ? (
        <div className="flex items-center gap-2 text-sm text-cream-700" aria-live="polite">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-cream-300 border-t-teal-600" aria-hidden="true" />
          <span>Counting matches…</span>
        </div>
      ) : (count ?? 0) > 0 ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-cream-900">
              {count} {noun} match{count === 1 ? '' : ''}
            </p>
            {isRefreshing ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700" aria-live="polite">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-teal-100 border-t-teal-600" aria-hidden="true" />
                Updating
              </span>
            ) : null}
          </div>
          {sampleNames && sampleNames.length > 0 ? (
            <p className="mt-0.5 truncate text-xs text-cream-700">{sampleNames.join(', ')}</p>
          ) : null}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-cream-700">No {noun} match these filters yet.</p>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700" aria-live="polite">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-teal-100 border-t-teal-600" aria-hidden="true" />
              Updating
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
