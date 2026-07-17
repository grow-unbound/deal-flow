'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, Area, AreaChart, Tooltip, XAxis, CartesianGrid } from 'recharts';
import { DetailCardRenderer, PerformanceCard, RankedList, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import { EntityAvatar, SeeAllSheet } from '@/components/seller/layout';
import { formatCompactInr } from '@/lib/utils';
import type { CohortDetailResponse } from '@/hooks/useCohorts';

interface CohortPerformanceTabProps {
  performance: CohortDetailResponse['performance'];
  performanceCards?: unknown[];
}

function formatSentShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function catalogInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '—';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase().slice(0, 2);
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function catalogHue(index: number): 'teal' | 'ember' | 'cream' {
  return index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream';
}

export function CohortPerformanceTab({ performance, performanceCards }: CohortPerformanceTabProps) {
  const [topMembersSheetOpen, setTopMembersSheetOpen] = useState(false);
  const [catalogsSheetOpen, setCatalogsSheetOpen] = useState(false);


  const sortedCatalogs = useMemo(
    () => [...performance.catalogs].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()),
    [performance.catalogs],
  );

  const visibleTopMembers = performance.top_members.slice(0, 4);
  const visibleCatalogs = sortedCatalogs.slice(0, 4);

  if (performanceCards?.length) {
    return (
      <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(performanceCards as DetailCardPayload[]).map((card) => (
          <DetailCardRenderer key={card.id} card={card} />
        ))}
      </section>
    );
  }


  return (
    <section className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <PerformanceCard title="Sales over time" subtitle="Last 12 months · current members" bodyClassName="p-0">
          <TrendFrame
            emptyTitle="No member sales trend yet"
            emptyDescription="This customer group does not have enough current-member sales history for a trend."
            summary={(
              <div className="flex flex-wrap items-baseline gap-3.5">
                <p className="font-display text-3xl font-medium leading-none tracking-[-0.018em] text-cream-950 tabular-nums">
                  {formatCompactInr(performance.summary.gmv_mtd, 1)}
                </p>
                <p className="text-sm text-cream-700">
                  <span className={performance.summary.growth_pct >= 0 ? 'font-semibold text-success-500' : 'font-semibold text-danger-500'}>
                    {performance.summary.growth_pct >= 0 ? '↑ +' : '↓ '}
                    {Math.abs(performance.summary.growth_pct).toFixed(1)}%
                  </span>{' '}
                  vs last month · AOV {formatCompactInr(performance.summary.aov, 1)}
                </p>
              </div>
            )}
            chart={performance.gmv_trend_12m.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performance.gmv_trend_12m}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
                  />
                  <Tooltip formatter={(value: number) => formatCompactInr(Number(value))} />
                  <Area type="monotone" dataKey="value" stroke="var(--teal-700)" fill="var(--teal-100)" fillOpacity={0.45} strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          />
        </PerformanceCard>

        <DetailCardRenderer
          card={{
            id: 'cohort-member-activity',
            representation: 'posture',
            title: 'Member activity',
            body: {
              tiles: [
                { label: 'Active members', value: `${performance.engagement.active_members}/${performance.engagement.total_members}`, sub: 'purchased in the last 90 days' },
                { label: 'Dormant members', value: performance.engagement.dormant_members, sub: 'no recent purchase signal' },
                { label: 'Response rate', value: `${performance.engagement.conversion_pct.toFixed(1)}%`, sub: 'campaign to submitted demand' },
                { label: 'Brands sold', value: performance.engagement.brands_sold, sub: `of ${performance.engagement.brands_carried} carried` },
              ],
              showSupportingText: true,
            },
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PerformanceCard
          title="Members driving sales"
          subtitle="By invoiced sales"
          actions={(
            <button
              type="button"
              className="shrink-0 text-sm font-semibold text-teal-700 no-underline"
              onClick={() => setTopMembersSheetOpen(true)}
            >
              See all →
            </button>
          )}
          bodyClassName="p-0"
        >
          <RankedList
            items={visibleTopMembers.map((member, index) => ({
              id: member.buyer_id,
              label: member.buyer_name,
              meta: member.city,
              value: formatCompactInr(member.spend_mtd, 1),
              supporting: `${member.order_count_mtd} orders`,
              initials: member.initials,
              hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
            }))}
            emptyTitle="No member activity yet"
            emptyDescription="This customer group does not have any ranked member activity yet."
          />
        </PerformanceCard>

        <DetailCardRenderer
          actions={(
            <button
              type="button"
              className="shrink-0 text-sm font-semibold text-teal-700 no-underline"
              onClick={() => setCatalogsSheetOpen(true)}
            >
              See all →
            </button>
          )}
          card={{
            id: 'cohort-campaigns',
            representation: 'mix',
            title: 'Campaigns to this customer group',
            subtitle: 'Recent campaign contribution',
            body: {
              items: visibleCatalogs.map((catalog, index) => ({
                id: catalog.campaign_id,
                label: catalog.catalog_name,
                value: formatCompactInr(catalog.gmv, 1),
                supporting: `${catalog.orders} ${catalog.orders === 1 ? 'order' : 'orders'} · ${catalog.opens} ${catalog.opens === 1 ? 'open' : 'opens'}`,
                pct: visibleCatalogs.length > 0 ? Math.round((catalog.gmv / Math.max(1, visibleCatalogs.reduce((sum, row) => sum + row.gmv, 0))) * 100) : null,
                tone: index % 3 === 0 ? '#204A41' : index % 3 === 1 ? '#B7703D' : '#A59984',
              })),
              emptyTitle: 'No campaign setup activity yet',
              emptyDescription: 'This customer group has no recent pricing and campaign setup activity.',
              mode: 'mix',
            },
          }}
        />
      </div>

      <SeeAllSheet
        open={topMembersSheetOpen}
        onOpenChange={setTopMembersSheetOpen}
        title="Top members"
        subtitle="By invoiced sales"
        items={performance.top_members}
        columns={[
          { label: '#', width: 48, className: 'px-5' },
          { label: 'Buyer', className: 'px-5' },
          { label: 'Sales', className: 'px-5 text-right' },
          { label: 'Orders', className: 'px-5 text-right' },
        ]}
        renderRow={(member, index) => (
          <tr key={member.buyer_id} className="border-b border-cream-300 bg-white">
            <td className="px-5 py-3.5 font-mono text-xs text-cream-600">{index + 1}</td>
            <td className="px-5 py-3.5 text-cream-900">
              <div className="flex items-center gap-3">
                <EntityAvatar
                  initials={member.initials}
                  hue={index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream'}
                  size={28}
                />
                <div>
                  <p className="text-base font-medium">{member.buyer_name}</p>
                  <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{member.city}</p>
                </div>
              </div>
            </td>
            <td className="px-5 py-3.5 text-right font-mono text-sm font-medium text-cream-900">{formatCompactInr(member.spend_mtd, 1)}</td>
            <td className="px-5 py-3.5 text-right font-mono text-xs text-cream-700">{member.order_count_mtd}</td>
          </tr>
        )}
      />

      <SeeAllSheet
        open={catalogsSheetOpen}
        onOpenChange={setCatalogsSheetOpen}
        title="Campaigns to this customer group"
        subtitle="Recent sends · sorted by date"
        items={sortedCatalogs}
        columns={[
          { label: 'Catalog', className: 'px-5' },
          { label: 'Sent', className: 'px-5' },
          { label: 'Opens', className: 'px-5 text-right' },
          { label: 'Orders', className: 'px-5 text-right' },
          { label: 'GMV', className: 'px-5 text-right' },
        ]}
        renderRow={(catalog) => (
          <tr key={catalog.campaign_id} className="border-b border-cream-300 bg-white">
            <td className="px-5 py-3.5 text-cream-900">{catalog.catalog_name}</td>
            <td className="px-5 py-3.5 font-mono text-sm text-cream-700">{formatSentShort(catalog.sent_at)}</td>
            <td className="px-5 py-3.5 text-right text-cream-900">{catalog.opens}</td>
            <td className="px-5 py-3.5 text-right text-cream-900">{catalog.orders}</td>
            <td className="px-5 py-3.5 text-right font-mono text-sm font-medium text-cream-900">{formatCompactInr(catalog.gmv, 1)}</td>
          </tr>
        )}
      />
    </section>
  );
}
