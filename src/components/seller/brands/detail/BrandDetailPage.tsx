'use client';

import { useMemo, useState } from 'react';
import { Archive, Download, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/empty-state';
import {
  useArchiveTenantBrand,
  useTenantBrandDetail,
  useUpdateTenantBrand,
  type BrandDetailResponse,
} from '@/hooks/useBrands';
import { formatCompactInr } from '@/lib/utils';
import { BrandDetailsTab } from './BrandDetailsTab';
import { BrandPerformanceTab } from './BrandPerformanceTab';
import { BrandBuyersTab } from './BrandBuyersTab';
import { BrandCatalogsTab } from './BrandCatalogsTab';
import { BrandActivityTimeline } from './BrandActivityTimeline';

type TabId = 'details' | 'performance' | 'buyers' | 'catalogs' | 'activity';

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
    `${header.skus} SKUs · ${header.portfolio_share_pct.toFixed(1)}% of portfolio`,
  ];
}

export function BrandDetailPage({ id }: BrandDetailPageProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('performance');
  const { data, isLoading, isError } = useTenantBrandDetail(id);
  const updateMutation = useUpdateTenantBrand(id);
  const archiveMutation = useArchiveTenantBrand(id);

  const tiles = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'GMV · this month',
        value: formatCompactInr(data.meta_strip_4.gmv_mtd),
        sub: (
          <span>
            <span className={data.meta_strip_4.growth_pct >= 0 ? 'up' : 'down'}>
              {data.meta_strip_4.growth_pct >= 0 ? '↑ +' : '↓ '}
              {Math.abs(data.meta_strip_4.growth_pct).toFixed(1)}%
            </span>{' '}
            vs last month
          </span>
        ),
      },
      {
        label: 'Active buyers',
        value: `${data.meta_strip_4.active_buyers}/${data.meta_strip_4.total_buyers}`,
        sub: 'bought this month',
      },
      {
        label: 'Low-stock SKUs',
        value: data.meta_strip_4.low_stock_skus,
        sub: 'reorder this week',
      },
      {
        label: 'Catalog freshness',
        value: data.meta_strip_4.days_since_catalog != null ? `${data.meta_strip_4.days_since_catalog}d ago` : '—',
        sub: data.meta_strip_4.last_sent_date
          ? `last sent ${new Date(data.meta_strip_4.last_sent_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
          : 'No catalog sent',
      },
    ];
  }, [data]);

  if (isLoading) return <LoadingState label="Loading brand details..." />;
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
            <button type="button" aria-label="Share" className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-cream-700 hover:bg-cream-100">
              <Share2 size={14} />
            </button>
            <Button type="button" className="h-9 gap-1.5 border border-cream-400 bg-white px-4 text-[13px] font-medium text-teal-700 hover:bg-cream-100">
              <Download size={14} />
              Export
            </Button>
            <AlertDialog>
              <AlertDialogTrigger className="cockpit-btn cockpit-btn-secondary h-9 px-4 text-cream-800">
                <Archive size={14} />
                Archive
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this brand?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will hide the brand from active views. You can restore it later from admin tools.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archiveMutation.archive()}>Confirm archive</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button className="cockpit-btn h-9 bg-teal-700 px-5 text-cream-50 hover:bg-teal-800" onClick={() => router.push('/shop')}>Open buyer app preview</Button>
          </div>
        }
      />
      <div className="mt-6 border-b border-cream-300" />

      <MetaStrip4 tiles={tiles} />

      <DetailTabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'performance', label: 'Performance' },
          { id: 'buyers', label: 'Buyers', badge: data.buyers.length },
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
      {tab === 'performance' ? <BrandPerformanceTab performance={data.performance} /> : null}
      {tab === 'buyers' ? <BrandBuyersTab buyers={data.buyers} /> : null}
      {tab === 'catalogs' ? <BrandCatalogsTab catalogs={data.catalogs} /> : null}
      {tab === 'activity' ? <BrandActivityTimeline activity={data.activity} /> : null}
    </PageWrap>
  );
}
