import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { chunkArray, POSTGREST_IN_CHUNK_SIZE } from '@/lib/server/warehouse-data';

export interface ProductPeriodSummaryRow {
  tenant_product_id: string;
  invoice_units: number;
  invoice_value: number;
  invoice_count: number;
  estimate_units: number;
  estimate_value: number;
  order_units: number;
  order_value: number;
}

export interface ProductQuarterMetrics {
  current: ProductPeriodSummaryRow | null;
  previous: ProductPeriodSummaryRow | null;
}

export interface QuarterPeriodBounds {
  currentStart: string;
  previousStart: string;
  elapsedDays: number;
}

export function getProductTabQuarterBounds(now = new Date()): QuarterPeriodBounds {
  const quarterMeta = getSellerLandingPeriodMeta('quarter', now);
  return {
    currentStart: quarterMeta.current_start.slice(0, 10),
    previousStart: quarterMeta.previous_start.slice(0, 10),
    elapsedDays: quarterMeta.elapsed_days,
  };
}

export function trendPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function daysCoverFromQtd(onHand: number, unitsQtd: number, elapsedDays: number): number | null {
  if (unitsQtd <= 0) return null;
  const dailyRate = unitsQtd / Math.max(1, elapsedDays);
  if (dailyRate <= 0) return null;
  return Math.round(onHand / dailyRate);
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapPeriodRow(row: Record<string, unknown>): ProductPeriodSummaryRow {
  return {
    tenant_product_id: String(row.tenant_product_id),
    invoice_units: toNumber(row.invoice_units),
    invoice_value: toNumber(row.invoice_value),
    invoice_count: toNumber(row.invoice_count),
    estimate_units: toNumber(row.estimate_units),
    estimate_value: toNumber(row.estimate_value),
    order_units: toNumber(row.order_units),
    order_value: toNumber(row.order_value),
  };
}

export async function fetchInventoryOnHandByProduct(db: any, productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;

  for (const chunk of chunkArray(productIds, POSTGREST_IN_CHUNK_SIZE)) {
    const { data, error } = await db
      .schema('app')
      .from('tenant_inventory')
      .select('tenant_product_id, qty_available')
      .in('tenant_product_id', chunk)
      .is('deleted_at', null);

    if (error) throw error;

    for (const row of (data ?? []) as Array<{ tenant_product_id: string; qty_available: number | string | null }>) {
      const productId = String(row.tenant_product_id);
      map.set(productId, (map.get(productId) ?? 0) + toNumber(row.qty_available));
    }
  }

  return map;
}

export async function fetchProductPeriodSummaries(
  db: any,
  tenantId: string,
  productIds: string[],
  bounds: Pick<QuarterPeriodBounds, 'currentStart' | 'previousStart'>,
): Promise<Map<string, ProductQuarterMetrics>> {
  const map = new Map<string, ProductQuarterMetrics>();
  if (productIds.length === 0) return map;

  for (const productId of productIds) {
    map.set(productId, { current: null, previous: null });
  }

  for (const chunk of chunkArray(productIds, POSTGREST_IN_CHUNK_SIZE)) {
    const { data, error } = await db
      .schema('app')
      .from('metrics_product_period_summary')
      .select(
        'tenant_product_id, period_start, invoice_units, invoice_value, invoice_count, estimate_units, estimate_value, order_units, order_value',
      )
      .eq('tenant_id', tenantId)
      .eq('grain', 'quarter')
      .in('period_start', [bounds.currentStart, bounds.previousStart])
      .in('tenant_product_id', chunk)
      .is('deleted_at', null);

    if (error) throw error;

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const productId = String(row.tenant_product_id);
      const bucket = map.get(productId) ?? { current: null, previous: null };
      const mapped = mapPeriodRow(row);
      if (String(row.period_start) === bounds.currentStart) {
        bucket.current = mapped;
      } else if (String(row.period_start) === bounds.previousStart) {
        bucket.previous = mapped;
      }
      map.set(productId, bucket);
    }
  }

  return map;
}

export interface BrandPeriodRollup {
  sales_qtd: number;
  units_qtd: number;
  sales_qtd_trend_pct: number | null;
  units_qtd_trend_pct: number | null;
  demand_qtd_value: number;
  demand_qtd_units: number;
}

export function rollupPeriodByBrand(
  productToBrandId: Map<string, string>,
  periodByProduct: Map<string, ProductQuarterMetrics>,
): Map<string, BrandPeriodRollup> {
  const currentByBrand = new Map<string, { sales: number; units: number; demandValue: number; demandUnits: number }>();
  const previousByBrand = new Map<string, { sales: number; units: number }>();

  for (const [productId, metrics] of periodByProduct) {
    const brandId = productToBrandId.get(productId);
    if (!brandId) continue;

    if (metrics.current) {
      const bucket = currentByBrand.get(brandId) ?? { sales: 0, units: 0, demandValue: 0, demandUnits: 0 };
      bucket.sales += metrics.current.invoice_value;
      bucket.units += metrics.current.invoice_units;
      bucket.demandValue += metrics.current.estimate_value + metrics.current.order_value;
      bucket.demandUnits += metrics.current.estimate_units + metrics.current.order_units;
      currentByBrand.set(brandId, bucket);
    }

    if (metrics.previous) {
      const bucket = previousByBrand.get(brandId) ?? { sales: 0, units: 0 };
      bucket.sales += metrics.previous.invoice_value;
      bucket.units += metrics.previous.invoice_units;
      previousByBrand.set(brandId, bucket);
    }
  }

  const rollup = new Map<string, BrandPeriodRollup>();
  for (const [brandId, current] of currentByBrand) {
    const previous = previousByBrand.get(brandId) ?? { sales: 0, units: 0 };
    rollup.set(brandId, {
      sales_qtd: current.sales,
      units_qtd: current.units,
      sales_qtd_trend_pct: trendPct(current.sales, previous.sales),
      units_qtd_trend_pct: trendPct(current.units, previous.units),
      demand_qtd_value: current.demandValue,
      demand_qtd_units: current.demandUnits,
    });
  }

  return rollup;
}

export function deriveStockFlags(onHand: number, daysCover: number | null) {
  const outOfStock = onHand <= 0;
  const lowStock = !outOfStock && daysCover != null && daysCover < 14;
  return { outOfStock, lowStock };
}

export { isIdleStockSku } from '@/lib/server/warehouse-metrics';
export { loadLatestDemandByProduct } from '@/lib/server/warehouse-data';
