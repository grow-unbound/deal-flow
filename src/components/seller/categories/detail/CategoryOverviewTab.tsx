'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';
import { DetailCardRenderer, MetricGrid, PerformanceCard, RankedList, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import type { CategoryDetailOverview } from '@/hooks/useCategories';
import {
  CHART_AXIS_TICK_COLOR,
  CHART_TICK_FONT_SIZE,
  CHART_TOOLTIP_BORDER_COLOR,
  CHART_TOOLTIP_CURSOR_FILL,
  CHART_TREND_HIGHLIGHT,
  CHART_TREND_MUTED,
} from '@/lib/theme/chart-colors';
import { formatNumberValue } from '@/lib/utils';

interface CategoryOverviewTabProps {
  overview: CategoryDetailOverview;
  performanceCards?: unknown[];
}

export function CategoryOverviewTab({ overview, performanceCards }: CategoryOverviewTabProps) {
  const { trend_weekly, stock_health, top_brands } = overview;

  const hasChart = trend_weekly.some((w) => w.gmv > 0);

  if (performanceCards?.length) {
    return (
      <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(performanceCards as DetailCardPayload[]).map((card) => (
          <DetailCardRenderer key={card.id} card={card} />
        ))}
      </section>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-3">
        <PerformanceCard title="Sales over time" subtitle="6-week rolling window" bodyClassName="p-5">
          <TrendFrame
            emptyTitle="No sales over time yet"
            emptyDescription="This category does not have enough invoiced history for a trend."
            chart={hasChart ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend_weekly} barSize={28} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="week_label"
                    tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: CHART_AXIS_TICK_COLOR }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: number) => [formatNumberValue(v, 'CURRENCY_THRESHOLD'), 'GMV']}
                    contentStyle={{
                      borderRadius: 10,
                      border: `1px solid ${CHART_TOOLTIP_BORDER_COLOR}`,
                      fontSize: 12,
                      padding: '6px 10px',
                    }}
                    cursor={{ fill: CHART_TOOLTIP_CURSOR_FILL }}
                  />
                  <Bar dataKey="gmv" radius={[4, 4, 0, 0]}>
                    {trend_weekly.map((_, i) => (
                      <Cell
                        key={i}
                        fill={i === trend_weekly.length - 1 ? CHART_TREND_HIGHLIGHT : CHART_TREND_MUTED}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          />
        </PerformanceCard>

        {top_brands.length > 0 && (
          <PerformanceCard title="Brand contribution" subtitle="Which brands drive this category" bodyClassName="p-0">
            <RankedList
              items={top_brands.map((b, index) => ({
                id: b.id,
                label: b.name,
                meta: `${b.units_mtd} units`,
                value: b.gmv_mtd > 0 ? formatNumberValue(b.gmv_mtd, 'CURRENCY_THRESHOLD') : '—',
                initials: b.initials,
                hue: index % 2 === 0 ? 'teal' : 'ember',
              }))}
              emptyTitle="No brand contribution yet"
              emptyDescription="This category has no ranked brand contribution in the selected horizon."
            />
          </PerformanceCard>
        )}
      </div>

      <div className="space-y-3 xl:col-span-2">
        <p className="text-sm font-medium text-cream-700">Product action list</p>
        <MetricGrid
          className="mt-0"
          tiles={[
            { label: 'Active SKUs', value: stock_health.active_sku_count },
            { label: 'Out of stock', value: stock_health.oos_sku_count },
            { label: 'Low stock', value: stock_health.low_stock_sku_count },
            { label: 'No sales 30d', value: stock_health.uncovered_sku_count },
          ]}
        />
      </div>
    </div>
  );
}
