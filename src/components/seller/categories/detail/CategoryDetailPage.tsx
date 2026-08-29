'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PencilIcon } from 'lucide-react';
import { InsightStrip4 } from '@/components/seller/layout';
import { DetailHeader, DetailTabs } from '@/components/seller/detail';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { useCategoryDetail } from '@/hooks/useCategories';
import { CategoryFormSheet } from '@/components/seller/settings/CategoryFormSheet';
import { formatNumberValue } from '@/lib/utils';
import type { TenantCategory } from '@/types/tenant-categories';
import { CategoryProductsTab } from './CategoryProductsTab';
import { CategoryBrandsTab } from './CategoryBrandsTab';
import { CategoryDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type TabId = 'performance' | 'products' | 'brands';

interface CategoryDetailPageProps {
  id: string;
}

export function CategoryDetailPage({ id }: CategoryDetailPageProps) {
  const showPerformanceTab = false;
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-category-detail-tab',
    scopeKey: id,
    initialState: 'products',
  });
  const { data, isLoading, isError } = useCategoryDetail(id);
  const { isSellerAdmin } = useRole();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const tiles = useMemo(() => {
    if (!data) return [];
    const m = data.meta_strip_4;
    return [
      {
        label: 'Sales · QTD',
        value: formatNumberValue(m.sales_qtd_value, 'CURRENCY_THRESHOLD'),
        sub: `${m.sales_qtd_count} invoices`,
      },
      {
        label: 'Selling products',
        value: formatNumberValue(m.selling_product_count_qtd, 'COUNT'),
        sub: `of ${m.total_product_count} products`,
      },
      {
        label: 'Purchasing customers',
        value: formatNumberValue(m.purchasing_customers_qtd, 'COUNT'),
        sub: 'this quarter',
      },
      {
        label: 'Brands',
        value: formatNumberValue(m.brand_count, 'COUNT'),
        sub: `${m.total_product_count} products in category`,
      },
    ];
  }, [data]);

  const h = data?.header;
  const since = h ? new Date(h.created_at) : null;
  const carriedSince = since ? since.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';

  const editingCategory: TenantCategory | null = h
    ? {
        id: h.id,
        tenant_id: h.tenant_id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        is_active: h.is_active,
        display_order: h.display_order,
        external_ref: h.external_ref,
        r2_image_thumb_key: h.r2_image_thumb_key,
        r2_image_original_key: h.r2_image_original_key,
        r2_image_medium_key: h.r2_image_medium_key,
        deleted_at: h.deleted_at,
        created_at: h.created_at,
        updated_at: h.updated_at,
      }
    : null;

  const tabs = [
    ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
    { id: 'products', label: 'Products', badge: h?.active_sku_count },
    { id: 'brands', label: 'Brands', badge: h?.brand_count },
  ] as const;
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;

  useEffect(() => {
    if (activeTab !== tab) {
      setTab(activeTab as TabId);
    }
  }, [activeTab, setTab, tab]);

  if (!data && !isError) return <CategoryDetailSkeleton />;

  if (isError || !data) {
    return (
      <ErrorState
        heading="Couldn't load category"
        description="There was a problem fetching this category detail page."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1920px] px-4 py-4 md:px-6 md:py-4">
      <DetailHeader
        loading={isLoading}
        avatar={{ kind: 'brand', initials: h?.initials ?? 'CT', hue: 'teal', imageUrl: h?.image_url }}
        title={h?.name ?? ''}
        status={{ label: h?.is_active ? 'Active' : 'Archived', tone: h?.is_active ? 'success' : 'neutral' }}
        subtitle={h ? [h.description ?? '', `${h.active_sku_count} SKUs · ${h.brand_count} brands`, `Created ${carriedSince}`].filter(Boolean) : []}
        actions={
          isSellerAdmin ? (
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
              <PencilIcon size={14} />
              Edit category
            </Button>
          ) : null
        }
      />
      <div className="mt-6 border-b border-cream-300" />

      {data ? (
        <InsightStrip4 className="mt-6" showSupportingText tiles={tiles} />
      ) : (
        <div className="mt-6 grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-[14px]" />
          ))}
        </div>
      )}

      <DetailTabs tabs={tabs as unknown as Array<{ id: string; label: string; badge?: number }>} active={activeTab} onChange={(value) => setTab(value as TabId)} />

      {showPerformanceTab && activeTab === 'performance' ? (
        <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
      ) : null}
      {activeTab === 'products' ? <CategoryProductsTab categoryId={id} /> : null}
      {activeTab === 'brands' ? <CategoryBrandsTab categoryId={id} /> : null}

      <CategoryFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        editingCategory={editingCategory}
        onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['category-detail', id] })}
      />
    </div>
  );
}
