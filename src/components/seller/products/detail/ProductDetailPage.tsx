'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Archive, PencilIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useProductDetail, useUpdateProduct } from '@/hooks/useProducts';
import { ProductDetailsTab } from './ProductDetailsTab';
import { ProductPricingTab } from './ProductPricingTab';
import { ProductActivityTimeline } from './ProductActivityTimeline';
import { AddProductSheet } from '../AddProductSheet';

const ProductPerformanceTab = dynamic(
  () => import('./ProductPerformanceTab').then((m) => m.ProductPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

type TabId = 'details' | 'performance' | 'pricing' | 'activity';

interface ProductDetailPageProps {
  id: string;
}

function ProductDetailSkeleton() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-52" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-[14px]" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-80" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-[8px]" />
              <Skeleton className="h-9 w-24 rounded-[8px]" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
          <Skeleton className="h-[28rem] rounded-[14px]" />
          <Skeleton className="h-[28rem] rounded-[14px]" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-72 rounded-[14px]" />
          <Skeleton className="h-72 rounded-[14px]" />
        </div>
      </div>
    </PageWrap>
  );
}

function daysCoverClass(days: number): string {
  if (days === 0) return 'text-danger-700';
  if (days < 7) return 'text-warning-700';
  return 'text-cream-900';
}

export function ProductDetailPage({ id }: ProductDetailPageProps) {
  const router = useRouter();
  const { isSellerAssistant } = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-product-detail-tab',
    scopeKey: id,
    initialState: isSellerAssistant ? 'details' : 'performance',
  });
  const { data, isLoading, isError } = useProductDetail(id);
  const updateProduct = useUpdateProduct();
  const tabs = useMemo(
    () => [
      { id: 'details', label: 'Details' },
      ...(isSellerAssistant ? [] : [{ id: 'performance', label: 'Performance' }]),
      { id: 'pricing', label: 'Pricing & cohorts' },
      { id: 'activity', label: 'Activity' },
    ],
    [isSellerAssistant],
  );
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'details';

  useEffect(() => {
    if (activeTab !== tab) {
      setTab(activeTab as TabId);
    }
  }, [activeTab, setTab, tab]);

  const tiles = useMemo(() => {
    if (!data) return [];
    const m = data.detail.meta_strip_4;
    return [
      {
        label: 'Units · MTD',
        value: m.units_mtd,
        sub: <span><span className={m.growth_pct >= 0 ? 'up' : 'down'}>{m.growth_pct >= 0 ? '↑ +' : '↓ '}{Math.abs(m.growth_pct).toFixed(1)}%</span> vs last month</span>,
      },
      {
        label: 'Days of cover',
        value: <span className={daysCoverClass(m.days_cover)}>{m.days_cover} d</span>,
        sub: 'at current pace',
      },
      {
        label: 'On hand',
        value: m.on_hand,
        sub: 'bottles',
      },
      {
        label: 'Sell-through',
        value: `${m.sell_through_pct}%`,
        sub: 'last 30 days',
      },
    ];
  }, [data]);

  if (isLoading) return <ProductDetailSkeleton />;
  if (isError || !data) {
    return <ErrorState heading="Couldn't load product" description="There was a problem fetching this product detail page." />;
  }

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Products', href: '/products' },
          { label: data.detail.header.name, current: true },
        ]}
        avatar={{ kind: 'product' }}
        title={data.detail.header.name}
        status={{ label: data.detail.header.status_label, tone: data.detail.header.status_tone }}
        subtitle={[
          data.detail.header.brand,
          data.detail.header.sku,
          data.detail.header.pack,
          `MRP ₹${Math.round(data.detail.header.mrp).toLocaleString('en-IN')}`,
        ]}
        actions={isSellerAssistant ? null : (
          <div className="flex items-center gap-2 pt-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive">
                  <Archive size={14} />
                  Archive product
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this product?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will hide the product from active views.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => updateProduct.mutate({ id, data: { archive: true as unknown as boolean } })}>
                    Confirm archive
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
              <PencilIcon size={14} />
              Edit product
            </Button>
          </div>
        )}
      />

      <MetaStrip4
        tiles={isSellerAssistant
          ? tiles.filter((tile) => tile.label !== 'Units · MTD')
          : tiles}
      />

      <DetailTabs
        tabs={tabs}
        active={activeTab}
        onChange={(value) => setTab(value as TabId)}
      />

      {activeTab === 'details' ? (
        <ProductDetailsTab
          details={data.detail.details}
          role={data.detail.role}
          isSaving={updateProduct.isPending}
          onSave={(payload) => updateProduct.mutate({ id, data: payload })}
        />
      ) : null}
      {activeTab === 'performance' ? <ProductPerformanceTab performance={data.detail.performance} /> : null}
      {activeTab === 'pricing' ? (
        <ProductPricingTab
          productId={id}
          role={data.detail.role}
          pricingSummary={data.detail.pricing_summary}
          pricing={data.detail.pricing}
        />
      ) : null}
      {activeTab === 'activity' ? <ProductActivityTimeline activity={data.detail.activity} /> : null}

      {!isSellerAssistant ? (
        <AddProductSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          hideTrigger
          mode="edit"
          product={data.product}
        />
      ) : null}
    </PageWrap>
  );
}
