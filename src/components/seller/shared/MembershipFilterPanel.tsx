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

const LAST_SALE_OPTIONS = [
  { value: 'within_30_days', label: 'Last 30d' },
  { value: 'within_90_days', label: 'Last 90d' },
  { value: 'dormant_90_plus_days', label: 'Dormant 90d+' },
  { value: 'never_ordered', label: 'Never ordered' },
];

const SALES_90D_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
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
        <FilterRow label="Last sale">
          <Select
            value={buyerRules.last_sale_bucket ?? '__all__'}
            onValueChange={(value) => setBuyerRule('last_sale_bucket', value === '__all__' ? undefined : value as BuyerMembershipRules['last_sale_bucket'])}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="All buyers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All buyers</SelectItem>
              {LAST_SALE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterRow>
        <FilterRow label="Sales (90d)">
          <Select
            value={buyerRules.sales_90d_level ?? '__all__'}
            onValueChange={(value) => setBuyerRule('sales_90d_level', value === '__all__' ? undefined : value as BuyerMembershipRules['sales_90d_level'])}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="All spend bands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All spend bands</SelectItem>
              {SALES_90D_OPTIONS.map((option) => (
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
        <LiveCount isLoading={preview.isLoading} count={preview.data?.count} sampleNames={preview.data?.sample_names} noun="buyers" />
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
      title: brand.display_name_override ?? brand.master_brand?.name ?? 'Unnamed brand',
    })),
    [brandData],
  );
  const categoryItems = useMemo(
    () => (categoryData?.categories ?? []).map((category) => ({ id: category.id, title: category.name })),
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
      <LiveCount isLoading={preview.isLoading} count={preview.data?.count} sampleNames={preview.data?.sample_names} noun="products" />
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
  count,
  sampleNames,
  noun,
}: {
  isLoading: boolean;
  count: number | undefined;
  sampleNames: string[] | undefined;
  noun: string;
}) {
  return (
    <div className="rounded-[10px] border border-cream-300 bg-cream-100 px-3 py-2.5">
      {isLoading && count === undefined ? (
        <p className="text-sm text-cream-700">Counting matches…</p>
      ) : (count ?? 0) > 0 ? (
        <>
          <p className="text-sm font-semibold text-cream-900">
            {count} {noun} match{count === 1 ? '' : ''}
          </p>
          {sampleNames && sampleNames.length > 0 ? (
            <p className="mt-0.5 truncate text-xs text-cream-700">{sampleNames.join(', ')}</p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-cream-700">No {noun} match these filters yet.</p>
      )}
    </div>
  );
}
