'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { PerformanceCard } from '@/components/seller/detail';
import { SeeAllSheet, StatusTag } from '@/components/seller/layout';
import type { CatalogDetailResponse } from '@/hooks/useCatalogs';
import { formatCompactInr, formatDate } from '@/lib/utils';

interface CatalogPerformanceTabProps {
  performance: CatalogDetailResponse['performance'];
}

type TrendPeriod = '3m' | '12m' | 'ytd';

function openedTone(status: CatalogDetailResponse['performance']['per_buyer_activity'][number]['opened_status']) {
  if (status === 'Purchased') return 'success';
  if (status === 'Opened') return 'success';
  return 'warning';
}

function dayTick(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function CatalogPerformanceTab({ performance }: CatalogPerformanceTabProps) {
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

  return (
    <section className="mt-5 space-y-4">
      <div className="grid grid-cols-[1.75fr_1fr] gap-4">
        <PerformanceCard
          title="Cumulative orders"
          subtitle={`Since publish · valid until ${performance.summary.valid_until_label}`}
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
          <div className="px-5 pt-4">
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
          </div>
          <div className="h-[220px] px-4 pb-4 pt-2">
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
          </div>
        </PerformanceCard>

        <PerformanceCard title="Funnel" subtitle="Buyer engagement" bodyClassName="p-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-7 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Views</p>
              <p className="mt-1 font-display text-3xl leading-[0.95] tracking-[-0.02em] text-cream-950">{performance.summary.views}</p>
              <p className="mt-1 text-base text-cream-700">{performance.summary.unique_viewers} unique</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Opens → order</p>
              <p className="mt-1 font-display text-3xl leading-[0.95] tracking-[-0.02em] text-cream-950">{performance.summary.conversion_rate}%</p>
              <p className="mt-1 text-base text-cream-700">conversion</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">AOV</p>
              <p className="mt-1 font-display text-3xl leading-[0.95] tracking-[-0.02em] text-cream-950">{formatCompactInr(performance.summary.aov, 1)}</p>
              <p className="mt-1 text-base text-cream-700">across orders</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Abandoners</p>
              <p className="mt-1 font-display text-3xl leading-[0.95] tracking-[-0.02em] text-ember-700">{performance.summary.abandoners}</p>
              <p className="mt-1 text-base text-cream-700">opened, didn&apos;t order</p>
            </div>
          </div>
        </PerformanceCard>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PerformanceCard
          title="Top SKUs in this catalog"
          subtitle="Product performance"
          actions={(
            <button type="button" className="text-sm font-semibold text-teal-700 no-underline" onClick={() => setSkusSheetOpen(true)}>
              See more →
            </button>
          )}
          bodyClassName="p-0"
        >
          <div>
            {visibleTopSkus.map((sku, index) => (
              <div key={sku.tenant_product_id} className="grid grid-cols-[26px_1fr_auto] items-center gap-3 border-b border-cream-300 px-5 py-3.5 last:border-b-0">
                <p className="font-mono text-sm text-cream-600">{index + 1}</p>
                <div>
                  <p className="text-base font-medium text-cream-900">{sku.product_name}</p>
                  <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.06em] text-cream-700">{sku.internal_sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-md leading-none text-cream-950">{formatCompactInr(sku.gmv, 1)}</p>
                  <p className="mt-1 font-mono text-xs text-cream-700">{sku.units} units</p>
                </div>
              </div>
            ))}
          </div>
        </PerformanceCard>

        <PerformanceCard
          title="Per-buyer activity"
          subtitle="From this catalog&apos;s cohort"
          actions={(
            <button type="button" className="text-sm font-semibold text-teal-700 no-underline" onClick={() => setBuyersSheetOpen(true)}>
              See more →
            </button>
          )}
          bodyClassName="p-0"
        >
          <div>
            {visibleBuyers.map((buyer) => (
              <div key={buyer.buyer_id} className="grid grid-cols-[1.4fr_120px_80px_96px] items-center gap-3 border-b border-cream-300 px-5 py-3.5 last:border-b-0">
                <div>
                  <p className="text-base font-medium text-cream-900">{buyer.buyer_name}</p>
                  <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.06em] text-cream-700">{buyer.city}</p>
                </div>
                <div>
                  <StatusTag label={buyer.opened_status} tone={openedTone(buyer.opened_status)} />
                </div>
                <p className="text-right font-mono text-base text-cream-900">{buyer.orders}</p>
                <p className="text-right font-display text-md text-cream-950">{buyer.gmv > 0 ? formatCompactInr(buyer.gmv, 1) : '—'}</p>
              </div>
            ))}
          </div>
        </PerformanceCard>
      </div>

      <SeeAllSheet
        open={skusSheetOpen}
        onOpenChange={setSkusSheetOpen}
        title="Top SKUs in this catalog"
        subtitle="All catalog SKUs by GMV"
        items={performance.top_skus}
        columns={[
          { label: '#', width: 52, className: 'px-5' },
          { label: 'SKU', className: 'px-5' },
          { label: 'GMV', className: 'px-5 text-right' },
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
          { label: 'Orders', className: 'px-5 text-right' },
          { label: 'GMV', className: 'px-5 text-right' },
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
