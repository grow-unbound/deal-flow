'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Archive, PencilIcon } from 'lucide-react';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetricGrid } from '@/components/seller/detail';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import {
  useArchiveTenantBrand,
  useTenantBrandDetail,
  useUpdateTenantBrand,
  type BrandDetailResponse,
} from '@/hooks/useBrands';
import { formatCompactInr } from '@/lib/utils';
import { BrandDetailSkeleton as SharedBrandDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { BrandDetailsTab } from './BrandDetailsTab';
import { BrandProductsTab } from './BrandProductsTab';
import { BrandBuyersTab } from './BrandBuyersTab';
import { BrandCatalogsTab } from './BrandCatalogsTab';
import { BrandActivityTimeline } from './BrandActivityTimeline';
import { AddBrandCommand } from '../AddBrandCommand';

const BrandPerformanceTab = dynamic(
  () => import('./BrandPerformanceTab').then((m) => m.BrandPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

type TabId = 'details' | 'performance' | 'products' | 'buyers' | 'catalogs' | 'activity';

interface BrandDetailPageProps {
  id: string;
}

function BrandDetailSkeleton() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-52" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-80" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-[8px]" />
              <Skeleton className="h-9 w-24 rounded-[8px]" />
              <Skeleton className="h-9 w-24 rounded-[8px]" />
              <Skeleton className="h-9 w-44 rounded-[8px]" />
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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        <Skeleton className="h-[24rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function subtitle(header: BrandDetailResponse['header']) {
  const since = new Date(header.carried_since);
  const carriedSince = since.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return [
    header.category,
    header.region,
    `Carried since ${carriedSince}`,
    `${header.skus} SKUs · ${header.portfolio_share_pct.toFixed(1)}% of portfolio`,
  ];
}

export function BrandDetailPage({ id }: BrandDetailPageProps) {
  const [editOpen, setEditOpen] = useState(false);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-brand-detail-tab',
    scopeKey: id,
    initialState: 'performance',
  });
  const { data, isLoading, isError } = useTenantBrandDetail(id);
  const updateMutation = useUpdateTenantBrand(id);
  const archiveMutation = useArchiveTenantBrand(id);

  const tiles = useMemo(() => {
    if (!data) return [];
    const m = data.meta_strip_4;
    return [
      {
        // get_seller_brand_detail_v2 has no prior-period comparison, so this used to
        // show a fabricated growth badge. Show the doc-recommended supporting value
        // (product count) instead — see doc line 758.
        label: 'Invoiced sales 90D',
        value: formatCompactInr(m.gmv_mtd),
        sub: `${m.product_count} product${m.product_count !== 1 ? 's' : ''}`,
      },
      {
        // "Customers who purchased" (doc line 759, starred) has no backing data in
        // get_seller_brand_detail_v2 — no brand-buyer read model exists yet (same gap
        // as the "customers-buying-the-brand" performance card). Units sold is a
        // real, doc-listed alternative (line 761) rather than a fake 0/0.
        label: 'Units sold 90D',
        value: `${m.units_90d}`,
        sub: 'in the last 90 days',
      },
      {
        label: 'Recent sellers low/out of stock',
        value: m.low_stock_skus != null ? `${m.low_stock_skus}` : '—',
        sub: m.low_stock_skus != null ? 'reorder this week' : 'Not available yet',
      },
      {
        label: 'Recent campaign activity',
        value: m.days_since_catalog != null ? `${m.days_since_catalog}d ago` : '—',
        sub: m.last_sent_date
          ? `last sent ${new Date(m.last_sent_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
          : 'No catalog sent',
      },
    ];
  }, [data]);

  if (isLoading) return <SharedBrandDetailSkeleton />;
  if (isError || !data) return <ErrorState heading="Couldn't load brand" description="There was a problem fetching this brand detail page." />;

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Brands', href: '/brands' },
          { label: data.header.brand_name, current: true },
        ]}
        avatar={{ kind: 'brand', initials: data.header.initials, hue: data.header.hue }}
        title={data.header.brand_name}
        status={{ label: data.header.status_label, tone: data.header.status_tone }}
        subtitle={subtitle(data.header)}
        actions={
          <div className="flex items-center gap-2 pt-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-2">
                  <Archive size={14} />
                  Archive brand
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this brand?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The brand will be marked as inactive. The brand history will not be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={archiveMutation.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={archiveMutation.isPending} onClick={() => archiveMutation.archive()}>
                    {archiveMutation.isPending ? 'Archiving…' : 'Archive brand'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
              <PencilIcon size={14} />
              Edit brand
            </Button>
          </div>
        }
      />
      <div className="mt-6 border-b border-cream-300" />

      <MetricGrid className="mt-6" showSupportingText tiles={tiles} />

      <DetailTabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'performance', label: 'Performance' },
          { id: 'products', label: 'Products', badge: data.header.skus },
          { id: 'buyers', label: 'Buyers', badge: data.buyers_total },
          { id: 'catalogs', label: 'Catalogs', badge: data.catalogs.length },
          { id: 'activity', label: 'Activity' },
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'details' ? (
        <BrandDetailsTab
          details={data.details}
          isSaving={updateMutation.isPending}
          onSave={(payload) => updateMutation.mutate(payload)}
        />
      ) : null}
      {tab === 'performance' ? (
        <BrandPerformanceTab performanceCards={data.performance_cards} />
      ) : null}
      {tab === 'products' ? <BrandProductsTab brandId={id} /> : null}
      {tab === 'buyers' ? <BrandBuyersTab brandId={id} buyers={data.buyers} /> : null}
      {tab === 'catalogs' ? <BrandCatalogsTab brandId={id} /> : null}
      {tab === 'activity' ? <BrandActivityTimeline activity={data.activity} /> : null}

      <AddBrandCommand
        open={editOpen}
        onOpenChange={setEditOpen}
        hideTrigger
        mode="edit"
        brand={data.details}
      />
    </PageWrap>
  );
}
