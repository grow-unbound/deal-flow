import type { SupabaseClient } from '@supabase/supabase-js';

export type BuyerPricedLine = {
  tenant_product_id: string;
  qty: number;
  unit_price: number;
  gst_rate?: number | null;
  product_name?: string;
};

type PriceRow = { tenant_product_id: string; unit_price: number | string };

/**
 * Re-derives authoritative per-line prices via `app.resolve_prices_batch` — the same
 * RPC used for catalog display — and overwrites any client-supplied `unit_price`.
 * Order/estimate placement must never trust a client-sent price directly.
 * Items are grouped by qty since price can be qty-tiered, mirroring the grouping
 * already used in buyer-product-data.ts's catalog price resolution.
 */
export async function resolveAuthoritativePrices(
  db: SupabaseClient,
  params: { tenantId: string; buyerId: string; items: BuyerPricedLine[] },
): Promise<{ ok: true; items: BuyerPricedLine[] } | { ok: false; status: number; error: string }> {
  const { buyerId, items } = params;

  const grouped = new Map<number, string[]>();
  for (const item of items) {
    const qty = Math.max(1, Number(item.qty ?? 1));
    const bucket = grouped.get(qty) ?? [];
    bucket.push(item.tenant_product_id);
    grouped.set(qty, bucket);
  }

  const priceMap = new Map<string, number>();
  const responses = await Promise.all(
    Array.from(grouped.entries()).map(async ([qty, ids]) => {
      const { data, error } = await db.schema('app').rpc('resolve_prices_batch', {
        p_tenant_product_ids: ids,
        p_buyer_id: buyerId,
        p_qty: qty,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as PriceRow[];
    }),
  );
  for (const rows of responses) {
    for (const row of rows) {
      priceMap.set(row.tenant_product_id, Number(row.unit_price ?? 0));
    }
  }

  const priced: BuyerPricedLine[] = [];
  for (const item of items) {
    const resolved = priceMap.get(item.tenant_product_id);
    if (resolved === undefined || !Number.isFinite(resolved) || resolved <= 0) {
      return {
        ok: false,
        status: 409,
        error: `${item.product_name || 'One item'} could not be priced — it may no longer be available.`,
      };
    }
    priced.push({ ...item, unit_price: resolved });
  }

  return { ok: true, items: priced };
}
