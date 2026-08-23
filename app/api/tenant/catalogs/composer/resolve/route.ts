import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

const ResolveBodySchema = z.object({
  brand_ids: z.array(z.string()).optional(),
  category_ids: z.array(z.string()).optional(),
  availability: z.enum(['all', 'in_stock', 'out_of_stock']).optional(),
  excluded_ids: z.array(z.string()).optional(),
});

/**
 * POST /api/tenant/catalogs/composer/resolve
 * Returns all product IDs matching the given filter predicates server-side.
 * Called at save time when a campaign uses "select all matching" to ensure ALL matching
 * products are saved — not just the 100-product display page.
 */
export async function POST(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ResolveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 });
  }

  const { brand_ids, category_ids, availability, excluded_ids } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  let query = db
    .schema('app')
    .from('tenant_products')
    .select('id, tenant_brand_id, tenant_category_id')
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  if (brand_ids && brand_ids.length > 0) {
    query = query.in('tenant_brand_id', brand_ids);
  }
  if (category_ids && category_ids.length > 0) {
    query = query.in('tenant_category_id', category_ids);
  }

  const { data: matchingProducts, error } = await query;
  if (error) {
    console.error('[POST /api/tenant/catalogs/composer/resolve]', error.message);
    return NextResponse.json({ error: 'Failed to resolve products' }, { status: 500 });
  }

  const products = (matchingProducts ?? []) as Array<{ id: string }>;
  const excludedSet = new Set(excluded_ids ?? []);

  // availability filter requires inventory lookup
  if (availability && availability !== 'all') {
    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) {
      return NextResponse.json({ product_ids: [] });
    }

    const { data: inventoryRows, error: invError } = await db
      .schema('app')
      .from('tenant_inventory')
      .select('tenant_product_id, qty_available')
      .in('tenant_product_id', productIds)
      .is('deleted_at', null);

    if (invError) {
      console.error('[POST /api/tenant/catalogs/composer/resolve] inventory error:', invError.message);
      return NextResponse.json({ error: 'Failed to resolve inventory' }, { status: 500 });
    }

    const qtyByProduct = new Map<string, number>();
    for (const row of (inventoryRows ?? []) as Array<{ tenant_product_id: string; qty_available: number | null }>) {
      qtyByProduct.set(
        row.tenant_product_id,
        (qtyByProduct.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0),
      );
    }

    const product_ids = products
      .filter((p) => {
        if (excludedSet.has(p.id)) return false;
        const qty = qtyByProduct.get(p.id) ?? 0;
        return availability === 'in_stock' ? qty > 0 : qty <= 0;
      })
      .map((p) => p.id);

    return NextResponse.json({ product_ids });
  }

  const product_ids = products.filter((p) => !excludedSet.has(p.id)).map((p) => p.id);
  return NextResponse.json({ product_ids });
}
