'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DetailCardRenderer, DistributionList, PerformanceCard, RankedList, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import { formatCompactInr } from '@/lib/utils';
import type { LocationDetailResponse } from '@/hooks/useLocations';

interface LocationOverviewTabProps {
  data: LocationDetailResponse['overview'];
  performanceCards?: unknown[];
}

export function LocationOverviewTab({ data, performanceCards }: LocationOverviewTabProps) {
  const h = data.inventory_health;

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
    <div className="mt-6 grid grid-cols-2 gap-6">
      <PerformanceCard title="Revenue trend" subtitle="MTD by week" bodyClassName="p-5">
        <TrendFrame
          emptyTitle="No sales over time yet"
          emptyDescription="This location does not have enough invoiced history for a trend."
          chart={data.gmv_trend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.gmv_trend} barSize={28}>
                <XAxis
                  dataKey="week_label"
                  tick={{ fontSize: 11, fill: '#8A7E74' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: '#8A7E74' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'GMV']} />
                <Bar dataKey="gmv" fill="#0D9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        />
      </PerformanceCard>

      <PerformanceCard title="Inventory at linked warehouses" subtitle="Current stock position" bodyClassName="p-0">
        <DistributionList
          items={[
            { id: 'active', label: 'Active SKUs', value: h.active_skus },
            { id: 'oos', label: 'Out of stock', value: h.oos_skus },
            { id: 'low', label: 'Low stock', value: h.low_stock_skus },
            { id: 'cover', label: 'Avg days cover', value: h.avg_days_cover != null ? `${h.avg_days_cover}d` : '—' },
          ]}
          emptyTitle="No inventory posture available"
          emptyDescription="Linked warehouse inventory has not been captured for this location."
        />
      </PerformanceCard>

      <PerformanceCard title="Customers buying here" subtitle="Ranked activity, not permanent ownership" bodyClassName="p-0">
        <RankedList
          items={data.top_buyers.map((buyer) => ({
            id: buyer.buyer_id,
            label: buyer.business_name,
            meta: buyer.city,
            value: formatCompactInr(buyer.spend_mtd),
            supporting: buyer.outstanding_dues > 0 ? `${formatCompactInr(buyer.outstanding_dues)} overdue` : 'Current',
            initials: buyer.initials,
            hue: 'teal',
          }))}
          emptyTitle="No customers buying here yet"
          emptyDescription="This location does not have recent customer purchase activity."
        />
      </PerformanceCard>
    </div>
  );
}
