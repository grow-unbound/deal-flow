'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, Area, AreaChart, Tooltip, XAxis, CartesianGrid } from 'recharts';
import { EntityAvatar, SeeAllSheet } from '@/components/seller/layout';
import { formatCompactInr } from '@/lib/utils';
import type { CohortDetailResponse } from '@/hooks/useCohorts';

interface CohortPerformanceTabProps {
  performance: CohortDetailResponse['performance'];
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

export function CohortPerformanceTab({ performance }: CohortPerformanceTabProps) {
  const [topMembersSheetOpen, setTopMembersSheetOpen] = useState(false);
  const [catalogsSheetOpen, setCatalogsSheetOpen] = useState(false);

  const sortedCatalogs = useMemo(
    () => [...performance.catalogs].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()),
    [performance.catalogs],
  );

  const visibleTopMembers = performance.top_members.slice(0, 4);
  const visibleCatalogs = sortedCatalogs.slice(0, 4);

  return (
    <section className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-lg text-cream-950">GMV trend</h3>
            <p className="mt-0.5 text-sm text-cream-700">Last 12 months · from this cohort</p>
          </div>
          <div className="px-5 pb-2 pt-4">
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
          </div>
          <div className="h-[160px] p-4 pt-0">
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
          </div>
        </article>

        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-lg text-cream-950">Engagement</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-[18px] gap-y-[18px] px-[18px] py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Active members</p>
              <p className="mt-1 font-display text-2xl font-medium leading-none tracking-[-0.01em] text-cream-950 tabular-nums">
                {performance.engagement.active_members}/{performance.engagement.total_members}
              </p>
              <p className="mt-0.5 text-sm text-cream-700">ordered this month</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Dormant</p>
              <p className="mt-1 font-display text-2xl font-medium leading-none tracking-[-0.01em] text-danger-500">
                {performance.engagement.dormant_members}
              </p>
              <p className="mt-0.5 text-sm text-cream-700">no order in 30 days</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Conversion</p>
              <p className="mt-1 font-display text-2xl font-medium leading-none tracking-[-0.01em] text-cream-950 tabular-nums">
                {performance.engagement.conversion_pct.toFixed(1)}%
              </p>
              <p className="mt-0.5 text-sm text-cream-700">catalog → order</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Brands sold</p>
              <p className="mt-1 font-display text-2xl font-medium leading-none tracking-[-0.01em] text-cream-950 tabular-nums">
                {performance.engagement.brands_sold}
              </p>
              <p className="mt-0.5 text-sm text-cream-700">of {performance.engagement.brands_carried} carried</p>
            </div>
          </div>
        </article>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-cream-300 px-5 py-4">
            <div>
              <h3 className="font-display text-lg text-cream-950">Top members</h3>
              <p className="mt-0.5 text-sm text-cream-700">By GMV · this month</p>
            </div>
            <button
              type="button"
              className="shrink-0 pt-0.5 text-base font-medium text-teal-700 hover:text-teal-800"
              onClick={() => setTopMembersSheetOpen(true)}
            >
              See all →
            </button>
          </div>
          <ul>
            {visibleTopMembers.map((member, index) => (
              <li
                key={member.buyer_id}
                className="flex items-center gap-3 border-b border-cream-200 px-[18px] py-3 last:border-b-0"
              >
                <span className="w-4 shrink-0 font-mono text-xs text-cream-600">{index + 1}</span>
                <EntityAvatar initials={member.initials} hue={index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream'} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-cream-900">{member.buyer_name}</p>
                  <p className="font-mono text-xs uppercase tracking-[0.02em] text-cream-700">{member.city}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-medium tabular-nums text-cream-900">{formatCompactInr(member.spend_mtd, 1)}</p>
                  <p className="mt-0.5 text-xs text-cream-700">{member.order_count_mtd} orders</p>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-cream-300 px-5 py-4">
            <div>
              <h3 className="font-display text-lg text-cream-950">Catalogs to this cohort</h3>
              <p className="mt-0.5 text-sm text-cream-700">Recent sends</p>
            </div>
            <button
              type="button"
              className="shrink-0 pt-0.5 text-base font-medium text-teal-700 hover:text-teal-800"
              onClick={() => setCatalogsSheetOpen(true)}
            >
              See all →
            </button>
          </div>
          <ul>
            {visibleCatalogs.map((catalog, index) => (
              <li
                key={catalog.catalog_id}
                className="flex items-center gap-3 border-b border-cream-200 px-[18px] py-3 last:border-b-0"
              >
                <EntityAvatar initials={catalogInitials(catalog.catalog_name)} hue={catalogHue(index)} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-cream-900">{catalog.catalog_name}</p>
                  <p className="font-mono text-xs uppercase tracking-[0.02em] text-cream-700">
                    {formatSentShort(catalog.sent_at)}
                    <span className="text-cream-500"> · </span>
                    {catalog.opens} {catalog.opens === 1 ? 'open' : 'opens'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-medium tabular-nums text-cream-900">
                    {formatCompactInr(catalog.gmv, 1)}
                  </p>
                  <p className="mt-0.5 text-xs text-cream-700">
                    {catalog.orders} {catalog.orders === 1 ? 'order' : 'orders'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <SeeAllSheet
        open={topMembersSheetOpen}
        onOpenChange={setTopMembersSheetOpen}
        title="Top members"
        subtitle="By GMV · this month"
        items={performance.top_members}
        columns={[
          { label: '#', width: 48, className: 'px-5' },
          { label: 'Buyer', className: 'px-5' },
          { label: 'Spend', className: 'px-5 text-right' },
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
        title="Catalogs to this cohort"
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
          <tr key={catalog.catalog_id} className="border-b border-cream-300 bg-white">
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
