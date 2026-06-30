'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { LandingTable, SeeAllSheet } from '@/components/seller/layout';
import { PerformanceCard } from '@/components/seller/detail';
import type { BrandDetailResponse } from '@/hooks/useBrands';
import { formatCompactInr } from '@/lib/utils';
import { EntityAvatar } from '@/components/seller/layout';

type TrendPeriod = '12m' | 'ytd' | '3m';

interface BrandPerformanceTabProps {
  performance: BrandDetailResponse['performance'];
}

function periodLabel(period: TrendPeriod): string {
  if (period === 'ytd') return 'Year to date';
  if (period === '3m') return 'Last 3 months';
  return 'Last 12 months';
}

export function BrandPerformanceTab({ performance }: BrandPerformanceTabProps) {
  const [period, setPeriod] = useState<TrendPeriod>('12m');
  const [buyersSheetOpen, setBuyersSheetOpen] = useState(false);
  const [skusSheetOpen, setSkusSheetOpen] = useState(false);

  const trendData = useMemo(() => {
    const base = performance.monthly_trend;
    if (period === '3m') return base.slice(-3);
    if (period === 'ytd') {
      const now = new Date();
      const ytdPrefix = `${now.getUTCFullYear()}-`;
      const ytd = base.filter((point) => point.month.startsWith(ytdPrefix));
      return ytd.length ? ytd : base.slice(-6);
    }
    return base.slice(-12);
  }, [performance.monthly_trend, period]);

  const trendCurrent = trendData[trendData.length - 1]?.revenue ?? 0;
  const trendPrevious = trendData[trendData.length - 2]?.revenue ?? 0;
  const trendGrowth = trendPrevious > 0 ? ((trendCurrent - trendPrevious) / trendPrevious) * 100 : 0;

  const visibleTopBuyers = performance.top_buyers.slice(0, 4);
  const visibleTopSkus = performance.top_skus.slice(0, 4);

  const formatMonthTick = (monthKey: string) => {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short' });
  };

  const formatSent = (date: string) =>
    new Date(date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

  return (
    <section className="mt-5 space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <PerformanceCard
          className="col-span-2"
          title="GMV trend"
          subtitle={`${periodLabel(period)} · this brand`}
          actions={(
            <div className="inline-flex rounded-[10px] bg-cream-200 p-1">
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-base ${period === '12m' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('12m')}
              >
                12 mo
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-base ${period === 'ytd' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('ytd')}
              >
                YTD
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-base ${period === '3m' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('3m')}
              >
                3 mo
              </button>
            </div>
          )}
          bodyClassName="px-5 pt-3"
        >
          <div>
            <div className="flex items-end gap-3">
              <p className="font-display text-3xl leading-none text-cream-950">{formatCompactInr(trendCurrent)}</p>
              <p className="pb-0.5 text-base text-cream-700">
                <span className={trendGrowth >= 0 ? 'text-success-500' : 'text-danger-500'}>
                  {trendGrowth >= 0 ? '↑ +' : '↓ '}
                  {Math.abs(trendGrowth).toFixed(1)}%
                </span>{' '}
                vs last period · {formatCompactInr(trendPrevious)}
              </p>
            </div>
          </div>
          <div className="h-[230px] p-4 pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
                  tickFormatter={formatMonthTick}
                />
                <Tooltip formatter={(value: number) => formatCompactInr(Number(value))} />
                <Line dataKey="revenue" stroke="var(--teal-700)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PerformanceCard>

        <div className="space-y-4">
          <PerformanceCard title="This brand" bodyClassName="p-5">
            <p className="text-base leading-[1.55] text-cream-900">
              Margin is holding steady at <strong>{performance.insights.margin_avg_pct.toFixed(1)}%</strong>. Buyer reach this month is{' '}
              <strong>{performance.insights.buyer_reach}</strong>.
            </p>
          </PerformanceCard>

          <PerformanceCard title="Key metrics" bodyClassName="p-5">
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Margin (avg)</p>
                <p className="mt-1 font-display text-2xl leading-none text-cream-950">{performance.insights.margin_avg_pct.toFixed(1)}%</p>
                <p className="mt-1 text-xs text-cream-700">across SKUs</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Sell-through</p>
                <p className="mt-1 font-display text-2xl leading-none text-cream-950">{performance.insights.sell_through_pct}%</p>
                <p className="mt-1 text-xs text-cream-700">last 30 days</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Repeat rate</p>
                <p className="mt-1 font-display text-2xl leading-none text-cream-950">{performance.insights.repeat_rate_pct}%</p>
                <p className="mt-1 text-xs text-cream-700">buyers re-ordering</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Buyer reach</p>
                <p className="mt-1 font-display text-2xl leading-none text-cream-950">{performance.insights.buyer_reach}</p>
                <p className="mt-1 text-xs text-cream-700">bought this month</p>
              </div>
            </div>
          </PerformanceCard>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PerformanceCard
          title="Top buyers"
          subtitle="By GMV · this month"
          actions={(
            <button type="button" className="text-sm font-semibold text-teal-700 no-underline" onClick={() => setBuyersSheetOpen(true)}>
              See all →
            </button>
          )}
          bodyClassName="p-0"
        >
          <div>
            {visibleTopBuyers.map((buyer, index) => (
              <div key={buyer.id} className="grid grid-cols-[30px_1fr_auto] items-center gap-3 border-b border-cream-300 px-5 py-3.5">
                <p className="font-mono text-base text-cream-600">{index + 1}</p>
                <div className="flex items-center gap-3">
                  <EntityAvatar initials={buyer.name.slice(0, 2).toUpperCase()} hue={index % 2 === 0 ? 'teal' : 'ember'} size={34} />
                  <div>
                    <p className="text-base font-medium text-cream-900">{buyer.name}</p>
                    <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{buyer.city}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-md leading-none text-cream-950">{formatCompactInr(buyer.spend)}</p>
                  <p className="font-mono text-xs text-cream-700">{buyer.orders_label}</p>
                </div>
              </div>
            ))}
          </div>
        </PerformanceCard>

        <PerformanceCard
          title="Top SKUs"
          subtitle="By units · this month"
          actions={(
            <button type="button" className="text-sm font-semibold text-teal-700 no-underline" onClick={() => setSkusSheetOpen(true)}>
              See all →
            </button>
          )}
          bodyClassName="p-0"
        >
          <div>
            {visibleTopSkus.map((sku, index) => (
              <div key={sku.product_id} className="grid grid-cols-[30px_1fr_auto] items-center gap-3 border-b border-cream-300 px-5 py-3.5">
                <p className="font-mono text-base text-cream-600">{index + 1}</p>
                <div>
                  <p className="text-base font-medium text-cream-900">{sku.product}</p>
                  <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{sku.sku ?? sku.product_id}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-md leading-none text-cream-950">{formatCompactInr(sku.revenue)}</p>
                  <p className="font-mono text-xs text-cream-700">{Math.round(sku.units)} units</p>
                </div>
              </div>
            ))}
          </div>
        </PerformanceCard>
      </div>

      <PerformanceCard title="Campaign history" subtitle="What you sent · how it landed" bodyClassName="p-0">
        <LandingTable
          columns={[
            { label: 'Campaign', className: 'px-5' },
            { label: 'Sent', className: 'px-5' },
            { label: 'Customer group', className: 'px-5' },
            { label: 'Orders', className: 'px-5 text-right' },
            { label: 'GMV', className: 'px-5 text-right' },
          ]}
          className="rounded-none border-0 [&_thead_tr]:bg-cream-50"
        >
          {performance.catalog_history.map((catalog) => (
            <tr key={catalog.id} className="border-b border-cream-300 bg-white">
              <td className="px-5 py-3.5 text-cream-900">{catalog.name}</td>
              <td className="px-5 py-3.5 font-mono text-sm text-cream-700">{formatSent(catalog.sent_at)}</td>
              <td className="px-5 py-3.5 text-cream-900">{catalog.cohort}</td>
              <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{catalog.orders}</td>
              <td className="px-5 py-3.5 text-right font-display text-md leading-none text-cream-950">{formatCompactInr(catalog.gmv)}</td>
            </tr>
          ))}
        </LandingTable>
      </PerformanceCard>

      <SeeAllSheet
        open={buyersSheetOpen}
        onOpenChange={setBuyersSheetOpen}
        title="Top buyers"
        subtitle="All buyers by GMV for this brand"
        items={performance.top_buyers}
        columns={[
          { label: '#', width: 56, className: 'px-5' },
          { label: 'Buyer', className: 'px-5' },
          { label: 'Spend', className: 'px-5 text-right' },
          { label: 'Orders', className: 'px-5 text-right' },
        ]}
        renderRow={(buyer, index) => (
          <tr key={buyer.id} className="border-b border-cream-300 bg-white">
            <td className="px-5 py-3.5 font-mono text-base text-cream-700">{index + 1}</td>
            <td className="px-5 py-3.5 text-cream-900">
              <p className="font-medium">{buyer.name}</p>
              <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{buyer.city}</p>
            </td>
            <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{formatCompactInr(buyer.spend)}</td>
            <td className="px-5 py-3.5 text-right font-mono text-sm text-cream-700">{buyer.orders_label}</td>
          </tr>
        )}
      />

      <SeeAllSheet
        open={skusSheetOpen}
        onOpenChange={setSkusSheetOpen}
        title="Top SKUs"
        subtitle="All SKUs by units for this brand"
        items={performance.top_skus}
        columns={[
          { label: '#', width: 56, className: 'px-5' },
          { label: 'Product', className: 'px-5' },
          { label: 'Revenue', className: 'px-5 text-right' },
          { label: 'Units', className: 'px-5 text-right' },
        ]}
        renderRow={(sku, index) => (
          <tr key={sku.product_id} className="border-b border-cream-300 bg-white">
            <td className="px-5 py-3.5 font-mono text-base text-cream-700">{index + 1}</td>
            <td className="px-5 py-3.5 text-cream-900">
              <p className="font-medium">{sku.product || 'Unnamed product'}</p>
              <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{sku.sku ?? sku.product_id}</p>
            </td>
            <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{formatCompactInr(sku.revenue)}</td>
            <td className="px-5 py-3.5 text-right text-cream-700">{Math.round(sku.units)}</td>
          </tr>
        )}
      />
    </section>
  );
}
