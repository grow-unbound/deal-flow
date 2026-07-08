'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Pencil, RefreshCw } from 'lucide-react';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactInr } from '@/lib/utils';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { useCohortDetail, useRefreshCohort } from '@/hooks/useCohorts';
import { CohortBuyersTab } from './CohortBuyersTab';

const CohortPerformanceTab = dynamic(
  () => import('./CohortPerformanceTab').then((m) => m.CohortPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

const COHORT_DETAIL_TAB_SNAPSHOT_VERSION = 2;

type TabId = 'buyers' | 'performance';

interface CohortDetailPageProps {
  id: string;
}

function CohortDetailSkeleton() {
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
              <Skeleton className="h-9 w-[8.5rem] rounded-[8px]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        <Skeleton className="h-[24rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function formatRefreshedAt(iso: string | null | undefined): string {
  if (!iso) return 'Never refreshed';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function CohortDetailPage({ id }: CohortDetailPageProps) {
  const { isSellerAdmin } = useRole();
  const refreshMutation = useRefreshCohort(id);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-cohort-detail-tab',
    scopeKey: id,
    initialState: 'performance',
    version: COHORT_DETAIL_TAB_SNAPSHOT_VERSION,
  });

  const { data, isLoading, isError } = useCohortDetail(id);

  const tiles = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: 'GMV · MTD',
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
        label: 'Active members',
        value: `${data.meta_strip_4.active_members}/${data.meta_strip_4.total_members}`,
        sub: 'ordered this month',
      },
      {
        label: 'AOV',
        value: formatCompactInr(data.meta_strip_4.aov),
        sub: 'across this customer group',
      },
      {
        label: 'Conversion',
        value: `${data.meta_strip_4.conversion_pct.toFixed(1)}%`,
        sub: 'campaign → order',
      },
    ];
  }, [data]);

  if (isLoading) return <CohortDetailSkeleton />;
  if (isError || !data) return <ErrorState heading="Couldn't load customer group" description="There was a problem fetching this customer group detail page." />;

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Customer Groups', href: '/customer-groups' },
          { label: data.header.cohort_name, current: true },
        ]}
        avatar={{ kind: 'brand', initials: data.header.initials, hue: data.header.hue }}
        title={data.header.cohort_name}
        status={{ label: data.header.status_label, tone: data.header.status_tone }}
        subtitle={[data.header.subtitle.members_text, data.header.subtitle.description_text, data.header.subtitle.created_by_text]}
        actions={
          isSellerAdmin ? (
            <div className="flex items-center gap-2 pt-1">
              {!data.details_rules.is_static ? (
                <div className="flex flex-col items-end gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                  >
                    <RefreshCw size={14} strokeWidth={2} className={refreshMutation.isPending ? 'animate-spin' : ''} aria-hidden />
                    {refreshMutation.isPending ? 'Refreshing…' : 'Refresh now'}
                  </Button>
                  <span className="text-[11px] text-cream-500 pr-0.5">
                    {formatRefreshedAt(data.details_rules.last_refreshed_at)}
  </span>
                </div>
              ) : null}
              <Button variant="accent" size="sm" className="h-9 px-4" asChild>
                <Link href={`/customer-groups/${id}/edit`}>
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                  Edit customer group
                </Link>
              </Button>
            </div>
          ) : null
        }
      />

      <MetaStrip4 tiles={tiles} />

      <DetailTabs
        tabs={[
          { id: 'buyers', label: 'Buyers' },
          { id: 'performance', label: 'Performance' },
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'buyers' ? (
        <CohortBuyersTab
          buyers={data.buyers}
          rules_summary={data.rules_summary}
          activeMembersMtd={data.meta_strip_4.active_members}
        />
      ) : null}
      {tab === 'performance' ? <CohortPerformanceTab performance={data.performance} /> : null}
    </PageWrap>
  );
}
