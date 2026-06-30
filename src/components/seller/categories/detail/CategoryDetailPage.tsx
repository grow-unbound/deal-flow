'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { useCategoryDetail } from '@/hooks/useCategories';
import { CategoryFormSheet } from '@/components/seller/settings/CategoryFormSheet';
import { formatCompactInr } from '@/lib/utils';
import type { TenantCategory } from '@/types/tenant-categories';
import { CategoryOverviewTab } from './CategoryOverviewTab';
import { CategoryProductsTab } from './CategoryProductsTab';
import { CategoryBrandsTab } from './CategoryBrandsTab';
import { CategoryActivityTab } from './CategoryActivityTab';

type TabId = 'performance' | 'products' | 'brands' | 'activity';

interface CategoryDetailPageProps {
  id: string;
}

function CategoryDetailSkeleton() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <Skeleton className="h-4 w-52" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-[14px]" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-80" />
            </div>
          </div>
        </div>
        <div className="border-b border-cream-300" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[24rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

export function CategoryDetailPage({ id }: CategoryDetailPageProps) {
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-category-detail-tab',
    scopeKey: id,
    initialState: 'performance',
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
        label: 'GMV · this month',
        value: formatCompactInr(m.gmv_mtd),
        sub: (
          <span>
            <span className={m.growth_pct >= 0 ? 'up' : 'down'}>
              {m.growth_pct >= 0 ? '↑ +' : '↓ '}
              {Math.abs(m.growth_pct)}%
            </span>{' '}
            vs last month
          </span>
        ),
      },
      {
        label: 'Active buyers',
        value: `${m.active_buyer_count}`,
        sub: 'this month',
      },
      {
        label: 'OOS SKUs',
        value: `${m.oos_sku_count}`,
        sub: `${m.low_stock_sku_count} more low-stock`,
      },
      {
        label: 'Active SKUs',
        value: `${m.active_sku_count}`,
        sub: `${data.header.brand_count} brand${data.header.brand_count !== 1 ? 's' : ''}`,
      },
    ];
  }, [data]);

  if (isLoading) return <CategoryDetailSkeleton />;
  if (isError || !data) {
    return (
      <ErrorState
        heading="Couldn't load category"
        description="There was a problem fetching this category detail page."
      />
    );
  }

  const h = data.header;
  const since = new Date(h.created_at);
  const carriedSince = since.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  const editingCategory: TenantCategory = {
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
  };

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Categories', href: '/categories' },
          { label: h.name, current: true },
        ]}
        avatar={{ kind: 'brand', initials: h.initials, hue: 'teal' }}
        title={h.name}
        status={{ label: h.is_active ? 'Active' : 'Archived', tone: h.is_active ? 'success' : 'neutral' }}
        subtitle={[
          h.description ?? '',
          `${h.active_sku_count} SKUs · ${h.brand_count} brands`,
          `Created ${carriedSince}`,
        ].filter(Boolean)}
        actions={
          isSellerAdmin ? (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="flex items-center gap-1.5">
              <Pencil size={14} />
              Edit
            </Button>
          ) : null
        }
      />
      <div className="mt-6 border-b border-cream-300" />

      <MetaStrip4 tiles={tiles} />

      <DetailTabs
        tabs={[
          { id: 'performance', label: 'Performance' },
          { id: 'products', label: 'Products', badge: h.active_sku_count },
          { id: 'brands', label: 'Brands', badge: h.brand_count },
          { id: 'activity', label: 'Activity' },
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'performance' ? <CategoryOverviewTab overview={data.overview} /> : null}
      {tab === 'products' ? <CategoryProductsTab products={data.products} categoryId={id} /> : null}
      {tab === 'brands' ? <CategoryBrandsTab brands={data.brands} /> : null}
      {tab === 'activity' ? <CategoryActivityTab activity={data.activity} /> : null}

      <CategoryFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        editingCategory={editingCategory}
        onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['category-detail', id] })}
      />
    </PageWrap>
  );
}
