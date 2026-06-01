'use client';

import { ResponsiveContainer, Area, AreaChart, Tooltip, XAxis, CartesianGrid } from 'recharts';
import { LandingTable } from '@/components/seller/layout';
import { formatCompactInr, formatDate } from '@/lib/utils';
import type { CohortDetailResponse } from '@/hooks/useCohorts';

interface CohortPerformanceTabProps {
  performance: CohortDetailResponse['performance'];
}

export function CohortPerformanceTab({ performance }: CohortPerformanceTabProps) {
  return (
    <section className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-[17px] text-cream-950">GMV trend</h3>
            <p className="text-[13px] text-cream-700">Last 12 months · from this cohort</p>
          </div>
          <div className="px-5 pb-2 pt-4">
            <p className="font-display text-[50px] leading-[0.95] tracking-[-0.02em] text-cream-950">{formatCompactInr(performance.summary.gmv_mtd, 1)}</p>
            <p className="mt-2 text-[14px] text-cream-700">
              <span className={performance.summary.growth_pct >= 0 ? 'font-semibold text-success-500' : 'font-semibold text-danger-500'}>
                {performance.summary.growth_pct >= 0 ? '↑ +' : '↓ '}
                {Math.abs(performance.summary.growth_pct).toFixed(1)}%
              </span>{' '}
              vs last month · AOV {formatCompactInr(performance.summary.aov, 1)}
            </p>
          </div>
          <div className="h-[180px] p-4 pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performance.gmv_trend_12m}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--cream-700)', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatCompactInr(Number(value))} />
                <Area type="monotone" dataKey="value" stroke="var(--teal-700)" fill="var(--teal-100)" fillOpacity={0.45} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-[38px] leading-[1] text-cream-950">Engagement</h3>
          </div>
          <div className="grid grid-cols-2 gap-6 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Active members</p>
              <p className="mt-1 font-display text-[46px] leading-[0.95] tracking-[-0.02em] text-cream-950">
                {performance.engagement.active_members}/{performance.engagement.total_members}
              </p>
              <p className="mt-1 text-[13px] text-cream-700">ordered this month</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Dormant</p>
              <p className="mt-1 font-display text-[46px] leading-[0.95] tracking-[-0.02em] text-ember-700">{performance.engagement.dormant_members}</p>
              <p className="mt-1 text-[13px] text-cream-700">no order in 30 days</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Conversion</p>
              <p className="mt-1 font-display text-[46px] leading-[0.95] tracking-[-0.02em] text-cream-950">{performance.engagement.conversion_pct.toFixed(1)}%</p>
              <p className="mt-1 text-[13px] text-cream-700">catalog → order</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Brands sold</p>
              <p className="mt-1 font-display text-[46px] leading-[0.95] tracking-[-0.02em] text-cream-950">{performance.engagement.brands_sold}</p>
              <p className="mt-1 text-[13px] text-cream-700">of {performance.engagement.brands_carried} carried</p>
            </div>
          </div>
        </article>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-[38px] leading-[1] text-cream-950">Top members</h3>
            <p className="text-[13px] text-cream-700">By GMV · this month</p>
          </div>
          <ul>
            {performance.top_members.map((member, index) => (
              <li key={member.buyer_id} className="flex items-center gap-3 border-b border-cream-300 px-5 py-3 last:border-b-0">
                <span className="w-4 text-[12px] text-cream-500">{index + 1}</span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cream-300 bg-cream-100 text-[11px] font-semibold text-cream-700">
                  {member.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[22px] font-medium tracking-[-0.01em] text-cream-900">{member.buyer_name}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-600">{member.city}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-[24px] text-cream-950">{formatCompactInr(member.spend_mtd, 1)}</p>
                  <p className="text-[12px] text-cream-600">{member.order_count_mtd} orders</p>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-[38px] leading-[1] text-cream-950">Catalogs to this cohort</h3>
            <p className="text-[13px] text-cream-700">Recent sends</p>
          </div>
          <LandingTable
            columns={[
              { label: 'Catalog', className: 'px-5' },
              { label: 'Sent', className: 'px-5' },
              { label: 'Opens', className: 'px-5' },
              { label: 'Orders', className: 'px-5' },
              { label: 'GMV', align: 'right', className: 'px-5 text-right' },
            ]}
            className="rounded-none border-0"
          >
            {performance.catalogs.map((catalog) => (
              <tr key={catalog.catalog_id} className="border-b border-cream-300 bg-white last:border-b-0">
                <td className="px-5 py-3.5 text-cream-900">{catalog.catalog_name}</td>
                <td className="px-5 py-3.5 text-cream-700">{formatDate(catalog.sent_at)}</td>
                <td className="px-5 py-3.5 text-cream-900">{catalog.opens}</td>
                <td className="px-5 py-3.5 text-cream-900">{catalog.orders}</td>
                <td className="px-5 py-3.5 text-right font-display text-[15px] text-cream-950">{formatCompactInr(catalog.gmv, 1)}</td>
              </tr>
            ))}
          </LandingTable>
        </article>
      </div>
    </section>
  );
}
