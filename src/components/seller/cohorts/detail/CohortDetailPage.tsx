'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Pencil, RefreshCw } from 'lucide-react';
import { InsightStrip4 } from '@/components/seller/layout';
import { DetailHeader, DetailTabs } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumberValue } from '@/lib/utils';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { useCohortDetail, useCohortMemberBuyers, useRefreshCohort } from '@/hooks/useCohorts';
import type { BuyerMembershipRules } from '@/lib/zod';
import { CohortBuyersTab } from './CohortBuyersTab';
import { CustomerGroupFormSheet } from '../CustomerGroupFormSheet';
import { CohortDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

const CohortPerformanceTab = dynamic(
  () => import('./CohortPerformanceTab').then((m) => m.CohortPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

const COHORT_DETAIL_TAB_SNAPSHOT_VERSION = 2;

type TabId = 'buyers' | 'performance';

interface CohortDetailPageProps {
  id: string;
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
  const showPerformanceTab = false;
  const [editOpen, setEditOpen] = useState(false);
  const refreshMutation = useRefreshCohort(id);
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-cohort-detail-tab',
    scopeKey: id,
    initialState: 'buyers',
    version: COHORT_DETAIL_TAB_SNAPSHOT_VERSION,
  });

  const { data, isLoading, isError } = useCohortDetail(id, { includePerformance: false });
  const memberBuyersQuery = useCohortMemberBuyers(id, { enabled: editOpen });

  const tiles = useMemo(() => {
    if (!data) return [];
    const m = data.meta_strip_4;

    return [
      {
        label: 'Active members',
        value: `${m.active_member_count}/${m.member_count}`,
        sub: 'purchased this quarter',
      },
      {
        label: 'Group sales · QTD',
        value: formatNumberValue(m.sales_qtd_value, 'CURRENCY_THRESHOLD'),
        sub: `${m.sales_qtd_count} invoices`,
      },
      {
        label: 'Group demand · QTD',
        value: formatNumberValue(m.demand_qtd_value, 'CURRENCY_THRESHOLD'),
        sub: `${m.demand_qtd_count} docs`,
      },
      {
        label: 'Brands',
        value: m.brands_count == null ? 'All brands' : `${m.brands_count} brands`,
      },
    ];
  }, [data]);

  if (isError || (!isLoading && !data)) {
    return <ErrorState heading="Couldn't load customer group" description="There was a problem fetching this customer group detail page." />;
  }

  if (isLoading && !data) return <CohortDetailSkeleton />;

  return (
    <div className="px-4 py-4 md:px-6 md:py-4">
      <DetailHeader
        loading={isLoading}
        avatar={{ kind: 'brand', initials: data?.header.initials ?? 'CG', hue: data?.header.hue ?? 'cream' }}
        title={data?.header.cohort_name ?? ''}
        status={{ label: data?.header.status_label ?? '', tone: data?.header.status_tone ?? 'neutral' }}
        subtitle={data ? [data.header.subtitle.members_text, data.header.subtitle.description_text, data.header.subtitle.created_by_text] : []}
        actions={
          isSellerAdmin && data ? (
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
              <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => setEditOpen(true)}>
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                  Edit customer group
              </Button>
            </div>
          ) : null
        }
      />

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
        tabs={[
          { id: 'buyers', label: 'Buyers' },
          ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
        ]}
        active={tab}
        onChange={(value) => setTab(value as TabId)}
      />

      {tab === 'buyers' ? (
        data ? (
          <CohortBuyersTab
            cohortId={id}
            rules_summary={data.rules_summary}
            activeMembersMtd={data.meta_strip_4.active_member_count}
            details_rules={data.details_rules}
          />
        ) : (
          <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
        )
      ) : null}
      {showPerformanceTab && tab === 'performance' ? (
        data ? <CohortPerformanceTab /> : <Skeleton className="mt-4 h-[24rem] rounded-[14px]" />
      ) : null}
      {data ? (
        <CustomerGroupFormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          cohortId={id}
          defaultValues={{
            form_mode: 'simple',
            name: data.details_rules.name,
            description: data.details_rules.description,
            allowed_tenant_brand_ids: data.details_rules.allowed_tenant_brand_ids ?? [],
            membership_mode: data.details_rules.is_static ? 'manual' : 'automatic',
            selected_buyer_ids: (memberBuyersQuery.data?.buyers ?? []).map((buyer) => buyer.buyer_id),
            rules: data.details_rules.is_static ? undefined : (data.details_rules.rules as unknown as BuyerMembershipRules),
          }}
        />
      ) : null}
    </div>
  );
}
