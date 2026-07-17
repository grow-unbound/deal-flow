'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { SeeAllSheet } from '@/components/seller/layout';
import { CardEmptyState, DetailCardRenderer, PerformanceCard, RankedList, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import type { BrandDetailResponse } from '@/hooks/useBrands';
import { formatCompactInr } from '@/lib/utils';

type TrendPeriod = '12m' | 'ytd' | '3m';

interface BrandPerformanceTabProps {
  performance: BrandDetailResponse['performance'];
  performanceCards?: unknown[];
}

function periodLabel(period: TrendPeriod): string {
  if (period === 'ytd') return 'Year to date';
  if (period === '3m') return 'Last 3 months';
  return 'Last 12 months';
}

export function BrandPerformanceTab({ performance, performanceCards }: BrandPerformanceTabProps) {
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
          <TrendFrame
            emptyTitle="No sales over time yet"
            emptyDescription="This brand does not have enough invoiced history for a trend."
            summary={(
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
            )}
            chart={trendData.length > 0 ? (
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
            ) : null}
          />
        </PerformanceCard>

        <PerformanceCard title="Current inventory by warehouse" subtitle="Warehouse inventory detail is not yet available on this surface" bodyClassName="p-5">
          <CardEmptyState
            title="Unavailable"
            description="Inventory posture for this brand will render as a warehouse distribution when warehouse-level stock is available."
          />
        </PerformanceCard>
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
          <RankedList
            items={visibleTopBuyers.map((buyer, index) => ({
              id: buyer.id,
              label: buyer.name,
              meta: buyer.city,
              value: formatCompactInr(buyer.spend),
              supporting: buyer.orders_label,
              initials: buyer.name.slice(0, 2).toUpperCase(),
              hue: index % 2 === 0 ? 'teal' : 'ember',
            }))}
            emptyTitle="No buyers yet"
            emptyDescription="This brand does not have recent customer purchase activity."
          />
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
          <RankedList
            items={visibleTopSkus.map((sku) => ({
              id: sku.product_id,
              label: sku.product,
              meta: sku.sku ?? sku.product_id,
              value: formatCompactInr(sku.revenue),
              supporting: `${Math.round(sku.units)} units`,
            }))}
            emptyTitle="No product contribution yet"
            emptyDescription="This brand does not have any ranked product contribution in the selected horizon."
          />
        </PerformanceCard>
      </div>

      <PerformanceCard title="Campaign contribution" subtitle="Catalog and campaign outcomes for this brand" bodyClassName="p-0">
        <RankedList
          items={performance.catalog_history.map((catalog) => ({
            id: catalog.id,
            label: catalog.name,
            meta: catalog.cohort,
            value: formatCompactInr(catalog.gmv),
            supporting: `${catalog.orders} orders · sent ${formatSent(catalog.sent_at)}`,
          }))}
          emptyTitle="No campaign contribution yet"
          emptyDescription="Catalog and campaign contribution for this brand will appear here."
        />
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
