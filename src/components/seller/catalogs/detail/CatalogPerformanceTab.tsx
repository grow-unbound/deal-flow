'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { DetailCardRenderer, PerformanceCard, RankedList, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import { SeeAllSheet, StatusTag } from '@/components/seller/layout';
import type { CatalogDetailResponse } from '@/hooks/useCatalogs';
import { formatCompactInr, formatDate } from '@/lib/utils';

interface CatalogPerformanceTabProps {
  performance: CatalogDetailResponse['performance'];
  performanceCards?: unknown[];
}

type TrendPeriod = '3m' | '12m' | 'ytd';

function openedTone(status: CatalogDetailResponse['performance']['per_buyer_activity'][number]['opened_status']) {
  if (status === 'Converted') return 'success';
  if (status === 'Opened') return 'success';
  return 'warning';
}

function dayTick(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function conversionLabels(performance: CatalogDetailResponse['performance']) {
  const estimatesEnabled = performance.channels?.estimates_enabled ?? true;
  const ordersEnabled = performance.channels?.orders_enabled ?? true;
  const orderCount = performance.summary.order_count ?? performance.funnel.orders;
  const estimateCount = performance.summary.estimate_count ?? performance.funnel.estimates ?? 0;

  if (estimatesEnabled && !ordersEnabled) {
    return {
      cumulativeTitle: 'Engagement and demand timeline',
      conversionSubtitle: 'Enquiry volume since publish',
    };
  }
  if (ordersEnabled && !estimatesEnabled) {
    return {
      cumulativeTitle: 'Engagement and demand timeline',
      conversionSubtitle: 'Order volume since publish',
    };
  }

  const breakdown =
    estimateCount > 0 && orderCount > 0
      ? `${estimateCount} enquiries · ${orderCount} orders`
      : estimateCount > 0
        ? `${estimateCount} enquiries`
        : orderCount > 0
          ? `${orderCount} orders`
          : 'No conversions yet';

  return {
    cumulativeTitle: 'Engagement and demand timeline',
    conversionSubtitle: breakdown,
  };
}

export function CatalogPerformanceTab({ performance, performanceCards }: CatalogPerformanceTabProps) {

  const labels = conversionLabels(performance);
  const [period, setPeriod] = useState<TrendPeriod>('12m');
  const [skusSheetOpen, setSkusSheetOpen] = useState(false);
  const [buyersSheetOpen, setBuyersSheetOpen] = useState(false);
  const visibleTopSkus = performance.top_skus.slice(0, 5);
  const visibleBuyers = performance.per_buyer_activity.slice(0, 5);
  const trendData = useMemo(() => {
    const base = performance.cumulative_orders;
    if (base.length === 0) return base;

    const latest = new Date(base[base.length - 1].date);
    if (period === '3m') {
      const threshold = new Date(latest);
      threshold.setMonth(threshold.getMonth() - 3);
      return base.filter((point) => new Date(point.date) >= threshold);
    }
    if (period === 'ytd') {
      const currentYear = latest.getFullYear();
      return base.filter((point) => new Date(point.date).getFullYear() === currentYear);
    }
    const threshold = new Date(latest);
    threshold.setMonth(threshold.getMonth() - 12);
    return base.filter((point) => new Date(point.date) >= threshold);
  }, [performance.cumulative_orders, period]);

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
      <div className="grid grid-cols-[1.75fr_1fr] gap-4">
        <PerformanceCard
          title={labels.cumulativeTitle}
          subtitle={`${labels.conversionSubtitle} · valid until ${performance.summary.valid_until_label}`}
          actions={(
            <div className="inline-flex rounded-[10px] bg-cream-200 p-1">
              {(['3m', '12m', 'ytd'] as TrendPeriod[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-[8px] px-3 py-1.5 text-base ${period === option ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                  onClick={() => setPeriod(option)}
                >
                  {option === '3m' ? '3 mo' : option === '12m' ? '12 mo' : 'YTD'}
                </button>
              ))}
            </div>
          )}
          bodyClassName="p-0"
        >
          <TrendFrame
            emptyTitle="No catalog timeline yet"
            emptyDescription="This campaign does not have enough timeline activity for a trend."
            summary={(
              <div className="flex items-end gap-3">
                <p className="font-display text-3xl leading-none text-cream-950">{performance.summary.orders}</p>
                <p className="pb-1 text-base text-cream-700">
                  {formatCompactInr(performance.summary.gmv, 1)}
                  {' · '}
                  <span className={performance.summary.growth_pct >= 0 ? 'font-semibold text-success-500' : 'font-semibold text-danger-500'}>
                    {performance.summary.growth_pct >= 0 ? '↑ +' : '↓ '}
                    {Math.abs(performance.summary.growth_pct).toFixed(1)}%
                  </span>
                  {' '}vs previous catalog
                </p>
              </div>
            )}
            chart={trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="catalog-orders-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C26E3A" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#C26E3A" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
                    tickFormatter={dayTick}
                  />
                  <Tooltip
                    formatter={(value: number, key: string) =>
                      key === 'gmv_cumulative' ? formatCompactInr(Number(value), 1) : Number(value)
                    }
                    labelFormatter={(value) => formatDate(String(value))}
                  />
                  <Area
                    type="monotone"
                    dataKey="orders_cumulative"
                    stroke="#C26E3A"
                    strokeWidth={2.5}
                    fill="url(#catalog-orders-fill)"
                    dot={{ r: 0 }}
                    activeDot={{ r: 4, fill: '#fff', stroke: '#C26E3A', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          />
        </PerformanceCard>

        <DetailCardRenderer
          card={{
            id: 'catalog-funnel',
            representation: 'distribution',
            title: 'Campaign funnel',
            subtitle: 'Open to demand',
            body: {
              items: [
                { id: 'views', label: 'Views', value: performance.summary.views, supporting: `${performance.summary.unique_viewers} unique` },
                { id: 'conversions', label: 'Conversions', value: performance.summary.conversions ?? performance.summary.orders, supporting: labels.conversionSubtitle },
                { id: 'rate', label: 'Opens → conversion', value: `${performance.summary.conversion_rate}%`, supporting: 'conversion rate' },
                { id: 'aov', label: 'AOV', value: formatCompactInr(performance.summary.aov, 1), supporting: 'across conversions' },
                { id: 'abandons', label: 'Abandoners', value: performance.summary.abandoners, supporting: 'opened, did not convert' },
              ],
              emptyTitle: 'No funnel contribution yet',
              emptyDescription: 'This campaign does not have enough buyer engagement data yet.',
            },
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PerformanceCard
          title="Products driving demand"
          subtitle="Top requested SKUs"
          actions={(
            <button type="button" className="text-sm font-semibold text-teal-700 no-underline" onClick={() => setSkusSheetOpen(true)}>
              See more →
            </button>
          )}
          bodyClassName="p-0"
        >
          <RankedList
            items={visibleTopSkus.map((sku) => ({
              id: sku.tenant_product_id,
              label: sku.product_name,
              meta: sku.internal_sku,
              value: formatCompactInr(sku.gmv, 1),
              supporting: `${sku.units} units`,
            }))}
            emptyTitle="No ranked product outcomes yet"
            emptyDescription="This campaign does not have any product contribution yet."
          />
        </PerformanceCard>

        <PerformanceCard
          title="Customers to follow up"
          subtitle="Recipient activity from this campaign"
          actions={(
            <button type="button" className="text-sm font-semibold text-teal-700 no-underline" onClick={() => setBuyersSheetOpen(true)}>
              See more →
            </button>
          )}
          bodyClassName="p-0"
        >
          <RankedList
            items={visibleBuyers.map((buyer) => ({
              id: buyer.buyer_id,
              label: buyer.buyer_name,
              meta: buyer.city,
              value: buyer.gmv > 0 ? formatCompactInr(buyer.gmv, 1) : '—',
              supporting: (
                <span className="inline-flex items-center gap-2">
                  <StatusTag label={buyer.opened_status} tone={openedTone(buyer.opened_status)} />
                  <span>{buyer.orders} orders</span>
                </span>
              ),
            }))}
            emptyTitle="No recipient outcomes yet"
            emptyDescription="This campaign does not have enough recipient activity to rank outcomes yet."
          />
        </PerformanceCard>
      </div>

      <SeeAllSheet
        open={skusSheetOpen}
        onOpenChange={setSkusSheetOpen}
        title="Top SKUs in this catalog"
        subtitle="All catalog SKUs by demand value"
        items={performance.top_skus}
        columns={[
          { label: '#', width: 52, className: 'px-5' },
          { label: 'SKU', className: 'px-5' },
          { label: 'Demand value', className: 'px-5 text-right' },
          { label: 'Units', className: 'px-5 text-right' },
        ]}
        renderRow={(sku, index) => (
          <tr key={sku.tenant_product_id} className="border-b border-cream-300 bg-white">
            <td className="px-5 py-3.5 font-mono text-base text-cream-700">{index + 1}</td>
            <td className="px-5 py-3.5 text-cream-900">
              <p className="font-medium">{sku.product_name}</p>
              <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{sku.internal_sku}</p>
            </td>
            <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{formatCompactInr(sku.gmv, 1)}</td>
            <td className="px-5 py-3.5 text-right font-mono text-sm text-cream-700">{sku.units}</td>
          </tr>
        )}
      />

      <SeeAllSheet
        open={buyersSheetOpen}
        onOpenChange={setBuyersSheetOpen}
        title="Per-buyer activity"
        subtitle="All scoped buyers for this catalog"
        items={performance.per_buyer_activity}
        columns={[
          { label: 'Buyer', className: 'px-5' },
          { label: 'Opened', className: 'px-5' },
          { label: 'Conversions', className: 'px-5 text-right' },
          { label: 'Demand value', className: 'px-5 text-right' },
        ]}
        renderRow={(buyer) => (
          <tr key={buyer.buyer_id} className="border-b border-cream-300 bg-white">
            <td className="px-5 py-3.5 text-cream-900">
              <p className="font-medium">{buyer.buyer_name}</p>
              <p className="font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{buyer.city}</p>
            </td>
            <td className="px-5 py-3.5">
              <StatusTag label={buyer.opened_status} tone={openedTone(buyer.opened_status)} />
            </td>
            <td className="px-5 py-3.5 text-right font-mono text-sm text-cream-700">{buyer.orders}</td>
            <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{buyer.gmv > 0 ? formatCompactInr(buyer.gmv, 1) : '—'}</td>
          </tr>
        )}
      />
    </section>
  );
}
