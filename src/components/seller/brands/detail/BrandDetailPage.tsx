'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Archive, PencilIcon } from 'lucide-react';
import { InsightStrip4 } from '@/components/seller/layout';
import { DetailHeader, DetailTabs } from '@/components/seller/detail';
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
import { formatNumberValue } from '@/lib/utils';
import { BrandDetailsTab } from './BrandDetailsTab';
import { BrandProductsTab } from './BrandProductsTab';
import { BrandBuyersTab } from './BrandBuyersTab';
import { BrandCatalogsTab } from './BrandCatalogsTab';
import { AddBrandCommand } from '../AddBrandCommand';

const BrandPerformanceTab = dynamic(
  () => import('./BrandPerformanceTab').then((m) => m.BrandPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

type TabId = 'details' | 'performance' | 'products' | 'buyers' | 'catalogs';

interface BrandDetailPageProps {
  id: string;
}

function subtitle(header: BrandDetailResponse['header']) {
  const since = new Date(header.carried_since);
  const carriedSince = since.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return [
    header.category,
    header.region,
    `Carried since ${carriedSince}`,
    `${header.skus} SKUs · ${formatNumberValue(header.portfolio_share_pct, 'PERCENTAGE')} of portfolio`,
  ];
}

export function BrandDetailPage({ id }: BrandDetailPageProps) {
  const showPerformanceTab = false;
  const [editOpen, setEditOpen] = useState(false);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-brand-detail-tab',
    scopeKey: id,
    initialState: 'details',
  });
  const { data, isLoading, isError } = useTenantBrandDetail(id, { includePerformance: false });
  const updateMutation = useUpdateTenantBrand(id);
  const archiveMutation = useArchiveTenantBrand(id);

  const tabs = useMemo(
    () => [
      { id: 'details', label: 'Details' },
      ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
      { id: 'products', label: 'Products', badge: data?.header.skus },
      { id: 'buyers', label: 'Buyers', badge: data?.buyers_total },
      { id: 'catalogs', label: 'Catalogs', badge: data?.catalogs.length },
    ],
    [data?.buyers_total, data?.catalogs.length, data?.header.skus, showPerformanceTab],
  );
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'details';

  useEffect(() => {
    if (activeTab !== tab) {
      setTab(activeTab as TabId);
    }
  }, [activeTab, setTab, tab]);

  const tiles = useMemo(() => {
    if (!data) return [];
    const m = data.meta_strip_4;
    return [
      {
        // get_seller_brand_detail_v2 has no prior-period comparison, so this used to
        // show a fabricated growth badge. Show the doc-recommended supporting value
        // (product count) instead — see doc line 758.
        label: 'Invoiced sales 90D',
        value: formatNumberValue(m.gmv_mtd, 'CURRENCY_THRESHOLD'),
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

  if (isError || (!isLoading && !data)) {
    return <ErrorState heading="Couldn't load brand" description="There was a problem fetching this brand detail page." />;
  }

  return (
    <div className="px-4 py-4 md:px-6 md:py-4">
      <DetailHeader
        loading={isLoading}
        avatar={{ kind: 'brand', initials: data?.header.initials ?? 'BR', hue: data?.header.hue ?? 'cream' }}
        title={data?.header.brand_name ?? ''}
        status={{ label: data?.header.status_label ?? '', tone: data?.header.status_tone ?? 'neutral' }}
        subtitle={data ? subtitle(data.header) : []}
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

      {data ? (
        <InsightStrip4 className="mt-6" showSupportingText tiles={tiles} />
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
          <BrandDetailsTab
            details={data.details}
            isSaving={updateMutation.isPending}
            onSave={(payload) => updateMutation.mutate(payload)}
          />
        ) : (
          <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
        )
      ) : null}
      {showPerformanceTab && activeTab === 'performance' ? (
        data ? <BrandPerformanceTab performanceCards={data.performance_cards} /> : <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
      ) : null}
      {activeTab === 'products' ? <BrandProductsTab brandId={id} /> : null}
      {activeTab === 'buyers' ? (
        data ? <BrandBuyersTab brandId={id} buyers={data.buyers} /> : <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
      ) : null}
      {activeTab === 'catalogs' ? <BrandCatalogsTab brandId={id} /> : null}

      <AddBrandCommand
        open={editOpen}
        onOpenChange={setEditOpen}
        hideTrigger
        mode="edit"
        brand={data?.details ?? null}
      />
    </div>
  );
}
