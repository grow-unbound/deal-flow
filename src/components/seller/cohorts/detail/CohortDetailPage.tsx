'use client';

import { useMemo } from 'react';
import { Download, ExternalLink, Share2 } from 'lucide-react';
import { PageWrap } from '@/components/seller/layout';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactInr } from '@/lib/utils';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useCohortDetail, useUpdateCohortDetail } from '@/hooks/useCohorts';
import { CohortActivityTab } from './CohortActivityTab';
import { CohortDetailsRulesTab } from './CohortDetailsRulesTab';
import { CohortPerformanceTab } from './CohortPerformanceTab';

type TabId = 'details' | 'performance' | 'activity';

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
              <Skeleton className="h-9 w-24 rounded-[8px]" />
              <Skeleton className="h-9 w-24 rounded-[8px]" />
              <Skeleton className="h-9 w-9 rounded-[8px]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        <Skeleton className="h-[24rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

export function CohortDetailPage({ id }: CohortDetailPageProps) {
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-cohort-detail-tab',
    scopeKey: id,
    initialState: 'performance',
  });
  const { data, isLoading, isError } = useCohortDetail(id);
  const updateMutation = useUpdateCohortDetail(id);

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
        sub: 'across this cohort',
      },
      {
        label: 'Conversion',
        value: `${data.meta_strip_4.conversion_pct.toFixed(1)}%`,
        sub: 'catalog → order',
      },
    ];
  }, [data]);

  if (isLoading) return <CohortDetailSkeleton />;
  if (isError || !data) return <ErrorState heading="Couldn't load cohort" description="There was a problem fetching this cohort detail page." />;

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Cohorts', href: '/cohorts' },
          { label: data.header.cohort_name, current: true },
        ]}
        avatar={{ kind: 'brand', initials: data.header.initials, hue: data.header.hue }}
        title={data.header.cohort_name}
        status={{ label: data.header.status_label, tone: data.header.status_tone }}
        subtitle={[data.header.subtitle.members_text, data.header.subtitle.description_text, data.header.subtitle.created_by_text]}
        actions={
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              aria-label="Share"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-cream-300 bg-cream-50 text-cream-700"
            >
              <Share2 size={14} />
            </button>
            <button type="button" className="cockpit-btn cockpit-btn-secondary h-9 px-4 text-cream-800">
              <Download size={14} />
              Export
            </button>
            <button type="button" className="cockpit-btn h-9 bg-teal-900 px-4 text-white">
              <ExternalLink size={14} />
              Open buyer app preview
            </button>
          </div>
        }
      />

      <MetaStrip4 tiles={tiles} />

      <DetailTabs
        tabs={[
          { id: 'details', label: 'Details & rules' },
          { id: 'performance', label: 'Performance' },
          { id: 'activity', label: 'Activity' },
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'details' ? (
        <CohortDetailsRulesTab
          detailsRules={data.details_rules}
          isSaving={updateMutation.isPending}
          startInEditMode={false}
          onEditModeSync={() => {}}
          onSave={(payload) => updateMutation.mutate(payload)}
        />
      ) : null}
      {tab === 'performance' ? <CohortPerformanceTab performance={data.performance} /> : null}
      {tab === 'activity' ? <CohortActivityTab activity={data.activity} /> : null}
    </PageWrap>
  );
}
