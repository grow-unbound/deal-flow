'use client';

import { formatNumberValue } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Archive, PencilIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { InsightStrip4 } from '@/components/seller/layout';
import { DetailHeader, DetailTabs } from '@/components/seller/detail';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useProductDetail, useUpdateProduct } from '@/hooks/useProducts';
import { ProductDetailsTab } from './ProductDetailsTab';
import { ProductPricingTab } from './ProductPricingTab';
import { AddProductSheet } from '../AddProductSheet';
import { ProductDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

const ProductPerformanceTab = dynamic(
  () => import('./ProductPerformanceTab').then((m) => m.ProductPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

const ProductStockTab = dynamic(
  () => import('./ProductStockTab').then((m) => m.ProductStockTab),
  { ssr: false, loading: () => <Skeleton className="mt-4 h-[28rem] w-full" /> },
);

type TabId = 'details' | 'performance' | 'pricing' | 'stock';

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface ProductDetailPageProps {
  id: string;
}

function daysCoverClass(days: number): string {
  if (days === 0) return 'text-danger-700';
  if (days < 7) return 'text-warning-700';
  return 'text-cream-900';
}

export function ProductDetailPage({ id }: ProductDetailPageProps) {
  const router = useRouter();
  const { isSellerAssistant } = useRole();
  const showPerformanceTab = false;
  const [editOpen, setEditOpen] = useState(false);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-product-detail-tab',
    scopeKey: id,
    initialState: 'details',
  });
  const { data, isLoading, isError } = useProductDetail(id, { includePerformance: false });
  const updateProduct = useUpdateProduct();
  const tabs = useMemo(
    () => [
      { id: 'details', label: 'Details' },
      ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
      { id: 'pricing', label: 'Pricelists' },
      { id: 'stock', label: 'Stock' },
    ],
    [showPerformanceTab],
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
        label: 'Sales · QTD',
        value: formatNumberValue(m.sales_qtd_value, 'CURRENCY_THRESHOLD'),
        sub: `${m.sales_qtd_count} invoices`,
      },
      {
        label: 'Purchased buyers · QTD',
        value: m.purchased_buyers_qtd,
        sub: `${m.units_qtd} units sold`,
      },
      {
        label: 'Demand · QTD',
        value: formatNumberValue(m.demand_qtd_value, 'CURRENCY_THRESHOLD'),
        sub: `${m.demand_qtd_units} units · ${m.demand_qtd_count} docs`,
      },
      {
        label: 'Stock on hand',
        value: m.total_stock,
        sub: m.days_cover != null ? <span className={daysCoverClass(m.days_cover)}>{m.days_cover}d cover</span> : 'No sales this month',
      },
    ];
  }, [data]);

  if (isError || (!isLoading && !data)) {
    return <ErrorState heading="Couldn't load product" description="There was a problem fetching this product detail page." />;
  }

  if (isLoading && !data) return <ProductDetailSkeleton />;

  return (
    <div className="px-4 py-4 md:px-6 md:py-4">
      <DetailHeader
        loading={isLoading}
        avatar={{
          kind: 'product',
          initials: getInitials(data?.detail.header.name ?? 'Product'),
          hue: 'teal',
          imageUrl: data?.product.image_urls?.[0] ?? null,
        }}
        title={data?.detail.header.name ?? ''}
        status={{ label: data?.detail.header.status_label ?? '', tone: data?.detail.header.status_tone ?? 'neutral' }}
        subtitle={
          data
            ? [
                data.detail.header.brand,
                data.detail.header.sku,
                data.detail.header.pack,
                `MRP ${formatNumberValue(data.detail.header.mrp, 'CURRENCY_EXACT')}`,
              ]
            : []
        }
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

      {data ? (
        <InsightStrip4
          className="mt-6"
          showSupportingText
          tiles={isSellerAssistant
            ? tiles.filter((tile) => tile.label !== 'Units · MTD')
            : tiles}
        />
      ) : (
        <div className="mt-6 grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-[14px]" />
          ))}
        </div>
      )}

      <DetailTabs
        tabs={tabs}
        active={activeTab}
        onChange={(value) => setTab(value as TabId)}
      />

      {activeTab === 'details' ? (
        data ? (
          <ProductDetailsTab
            details={data.detail.details}
            role={data.detail.role}
            isSaving={updateProduct.isPending}
            onSave={(payload) => updateProduct.mutate({ id, data: payload })}
          />
        ) : (
          <Skeleton className="mt-4 h-[28rem] rounded-[14px]" />
        )
      ) : null}
      {showPerformanceTab && activeTab === 'performance' ? (
        data ? <ProductPerformanceTab performance={data.detail.performance} /> : <Skeleton className="mt-4 h-[28rem] rounded-[14px]" />
      ) : null}
      {activeTab === 'pricing' ? (
        data ? (
          <ProductPricingTab
            productId={id}
            role={data.detail.role}
            pricingSummary={data.detail.pricing_summary}
            pricing={data.detail.pricing}
          />
        ) : (
          <Skeleton className="mt-4 h-[28rem] rounded-[14px]" />
        )
      ) : null}
      {activeTab === 'stock' ? <ProductStockTab productId={id} /> : null}

      {!isSellerAssistant ? (
        <AddProductSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          hideTrigger
          mode="edit"
          product={data?.product}
        />
      ) : null}
    </div>
  );
}
