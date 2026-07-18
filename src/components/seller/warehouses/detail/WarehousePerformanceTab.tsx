'use client';

import { DetailCardRenderer, type DetailCardPayload } from '@/components/seller/detail';
import { formatDate } from '@/lib/utils';
import type { WarehouseDetailResponse } from '@/types/tenant-warehouses';

export function WarehousePerformanceTab({
  data,
  performanceCards,
}: {
  data: WarehouseDetailResponse['performance'];
  performanceCards?: unknown[];
}) {
  // get_seller_warehouse_detail_v2 always returns 3 cards, but ships them all
  // `availability: 'unavailable'` (no V2 warehouse read model exists yet) — only
  // take the v2 path once at least one card is actually usable, otherwise fall
  // through to the real inventory-backed cards below.
  const hasUsableV2Card = (performanceCards as DetailCardPayload[] | undefined)?.some(
    (card) => card.availability !== 'unavailable',
  );

  if (hasUsableV2Card) {
    return (
      <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(performanceCards as DetailCardPayload[]).map((card) => (
          <DetailCardRenderer key={card.id} card={card} />
        ))}
      </section>
    );
  }

  return (
    <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <DetailCardRenderer
        card={{
          id: 'warehouse-health',
          representation: 'posture',
          title: 'Inventory health',
          subtitle: 'Current stock position',
          body: {
            tiles: [
              { label: 'Active SKUs', value: String(data.inventory_health.active_skus) },
              { label: 'Stockout SKUs', value: String(data.inventory_health.stockout_skus) },
              { label: 'Low stock SKUs', value: String(data.inventory_health.low_stock_skus) },
              {
                label: 'Avg sellable / SKU',
                value: data.inventory_health.avg_sellable_per_sku != null ? String(data.inventory_health.avg_sellable_per_sku) : '—',
              },
            ],
            showSupportingText: true,
          },
        }}
      />

      <DetailCardRenderer
        card={{
          id: 'warehouse-posture',
          representation: 'distribution',
          title: 'Current inventory posture',
          subtitle: 'Routing context and replenishment pressure',
          body: {
            items: [
              { id: 'sellable', label: 'Sellable units', value: data.stock_posture.sellable_units.toLocaleString('en-IN') },
              { id: 'reorder', label: 'Reorder triggered', value: String(data.stock_posture.reorder_triggered_skus) },
              { id: 'default', label: 'Default warehouse', value: data.stock_posture.is_default ? 'Yes' : 'No' },
              { id: 'location', label: 'Linked location', value: data.stock_posture.linked_location_name ?? '—' },
            ],
            emptyTitle: 'No inventory posture available',
            emptyDescription: 'Current warehouse posture is not available yet.',
          },
        }}
      />

      <DetailCardRenderer
        card={{
          id: 'warehouse-stock-risk',
          representation: 'ranked_list',
          title: 'Stock-risk product list',
          subtitle: 'Positive stock with no recent demand',
          body: {
            items: data.idle_stock.map((row) => ({
              id: row.tenant_product_id,
              label: row.product_name,
              meta: `${row.brand_name} · ${row.last_demand_at ? `Last demand ${formatDate(row.last_demand_at)}` : 'No recorded demand'}`,
              value: row.sellable_units.toLocaleString('en-IN'),
              supporting: 'sellable units',
            })),
            emptyTitle: 'No idle stock SKUs right now',
            emptyDescription: 'This warehouse has no current stock-risk products in the selected posture.',
          },
        }}
      />

      <DetailCardRenderer
        card={{
          id: 'warehouse-transfer-suggestions',
          representation: 'ranked_list',
          title: 'Transfer suggestions',
          subtitle: 'Latest inventory row updates',
          body: {
            items: data.recent_replenishment.map((row) => ({
              id: row.tenant_product_id,
              label: row.product_name,
              meta: `${row.brand_name} · Updated ${formatDate(row.updated_at)}`,
              value: row.qty_available.toLocaleString('en-IN'),
              supporting: `${row.qty_reserved.toLocaleString('en-IN')} reserved`,
            })),
            emptyTitle: 'No replenishment updates yet',
            emptyDescription: 'There are no recent warehouse transfer or replenishment cues yet.',
          },
        }}
      />
    </section>
  );
}
