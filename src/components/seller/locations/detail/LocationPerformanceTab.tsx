'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { CardEmptyState, DetailCardRenderer, PerformanceCard, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import type { LocationDetailResponse } from '@/hooks/useLocations';

interface LocationPerformanceTabProps {
  overview: LocationDetailResponse['overview'];
  performanceCards?: unknown[];
}

/**
 * Metrics V2 spec (specs/metrics-product-strategy-proposal-2026-07.md §11, Explore options):
 * ★ Sales over time, Order execution workload, ★ Brand and category mix,
 * ★ Inventory at linked warehouses, ★ Customers buying here.
 *
 * `get_seller_location_detail_v2` (supabase/migrations/20260716135550_..._phase_7_detail_bootstrap_rpcs.sql)
 * backs sales-over-time, order-execution-workload, and inventory-at-linked-warehouses with real data.
 * Brand/category mix and customers-buying-here have no V2 read model yet — rendered as unavailable
 * per the metrics_v2_empty_card_body pattern rather than hidden or faked.
 */
export function LocationPerformanceTab({ overview, performanceCards }: LocationPerformanceTabProps) {
  const cards = (performanceCards ?? []) as DetailCardPayload[];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const orderExecutionCard = cardById.get('order-execution-workload');
  const inventoryCard = cardById.get('inventory-at-linked-warehouses');
  const gmvTrend = overview.gmv_trend;

  return (
    <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <PerformanceCard title="Sales over time" subtitle="Invoiced sales, last 12 months" bodyClassName="p-0">
        <TrendFrame
          emptyTitle="No sales over time yet"
          emptyDescription="This location does not have enough invoiced history for a trend."
          chart={gmvTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gmvTrend} barSize={28}>
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
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Invoiced sales']} />
                <Bar dataKey="gmv" fill="#0D9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        />
      </PerformanceCard>

      {inventoryCard ? (
        <DetailCardRenderer card={inventoryCard} />
      ) : (
        <PerformanceCard title="Inventory at linked warehouses" subtitle="Current stock posture" bodyClassName="p-5">
          <CardEmptyState title="Unavailable" description="No current linked-stock posture is available for this location yet." />
        </PerformanceCard>
      )}

      {orderExecutionCard ? (
        <DetailCardRenderer card={orderExecutionCard} />
      ) : (
        <PerformanceCard title="Order execution workload" subtitle="Current workload" bodyClassName="p-5">
          <CardEmptyState title="Unavailable" description="No current order/estimate workload is available for this location yet." />
        </PerformanceCard>
      )}

      <PerformanceCard title="Brand and category mix" subtitle="Sales contribution and concentration" bodyClassName="p-5">
        <CardEmptyState
          title="Unavailable"
          tone="unavailable"
          description="No V2 location brand/category mix read model exists yet (spec §11 Explore, doc line 845)."
        />
      </PerformanceCard>

      <PerformanceCard title="Customers buying here" subtitle="Ranked customer activity" bodyClassName="p-5">
        <CardEmptyState
          title="Unavailable"
          tone="unavailable"
          description="No V2 location customer-ranking read model exists yet (spec §11 Explore, doc line 847)."
        />
      </PerformanceCard>
    </section>
  );
}
