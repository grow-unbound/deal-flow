import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

// ── Schema ───────────────────────────────────────────────────────────────────

const ImportProductSchema = z.object({
  internal_sku: z.string().min(1),
  name: z.string().min(1),
  name_override: z.string().min(1).optional(),
  tenant_brand_id: z.string().uuid(),
  mrp: z.number().positive(),
  base_selling_price: z.number().positive(),
  // gst_rate: z.number().min(0).max(100),
  // hsn_code: z.string().min(1),
  cost_price: z.number().positive().optional().nullable(),
  default_uom: z.string().optional().nullable(),
  pack_size: z.number().positive().optional().nullable(),
  // description: z.string().optional().nullable(),
});

const BulkImportBodySchema = z.object({
  products: z.array(ImportProductSchema).min(1, 'At least one product is required'),
});

type ImportProductRow = z.infer<typeof ImportProductSchema>;

interface RowResult {
  sku: string;
  status: 'imported' | 'skipped';
  error?: string;
}

// ── POST /api/tenant/products/import ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await req.json();
    const parsed = BulkImportBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { products } = parsed.data;
    const tenantId = claims.tenant_id;
    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    // Fetch all existing SKUs for this tenant to check uniqueness
    const { data: existingSkus } = await db
      .schema('app')
      .from('tenant_products')
      .select('internal_sku')
      .eq('tenant_id', tenantId)
      .is('is_active', true);

    const existingSkuSet = new Set<string>(
      (existingSkus ?? []).map((r: { internal_sku: string }) => r.internal_sku)
    );

    let imported = 0;
    let skipped = 0;
    // Pre-sized so we can fill results out of order (chunked inserts resolve after
    // the skip pass below) while still returning them in original row order.
    const results: RowResult[] = new Array(products.length);

    // Pass 1: apply the pre-fetched-SKU + intra-batch-duplicate check (sequential,
    // cheap, no DB round trip) and collect the rows that still need inserting.
    interface PendingRow {
      index: number;
      sku: string;
      payload: Record<string, unknown>;
    }
    const pending: PendingRow[] = [];
    const seenSkus = new Set<string>(existingSkuSet);

    products.forEach((product, index) => {
      const sku = product.internal_sku;

      // Check for duplicate SKU in existing DB (or earlier in this same batch)
      if (seenSkus.has(sku)) {
        skipped++;
        results[index] = { sku, status: 'skipped', error: 'SKU already exists in your catalog' };
        return;
      }
      seenSkus.add(sku); // Prevent duplicate SKUs within the same batch from both inserting

      // Seller_assistant cannot set cost_price
      const effectiveCostPrice =
        claims.role === 'seller_assistant' ? null : (product.cost_price ?? null);

      pending.push({
        index,
        sku,
        payload: {
          tenant_id: tenantId,
          tenant_brand_id: product.tenant_brand_id,
          master_product_id: null,
          internal_sku: sku,
          name_override: product.name_override?.trim() || product.name.trim(),
          mrp: product.mrp,
          base_selling_price: product.base_selling_price,
          cost_price: effectiveCostPrice,
          // gst_rate: product.gst_rate,
          // hsn_code: product.hsn_code,
          default_uom: product.default_uom ?? null,
          pack_size: product.pack_size ?? null,
          // description: product.description ?? null,
          attributes_override: {},
          image_urls: [],
          is_active: true,
          created_by: tenantId,
          updated_by: tenantId,
        },
      });
    });

    // Pass 2: insert in chunks instead of one round trip per row. A single
    // batched INSERT is all-or-nothing in Postgres, so a chunk size keeps
    // failure isolated to the rows in that chunk (rather than one row failing
    // and derailing 499 others) while still collapsing N round trips to N/chunk.
    const CHUNK_SIZE = 200;
    for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
      const chunk = pending.slice(i, i + CHUNK_SIZE);
      const { error: insertError } = await db
        .schema('app')
        .from('tenant_products')
        .insert(chunk.map((row) => row.payload));

      if (insertError) {
        let errMsg = 'Insert failed';
        if (insertError.code === '23505') {
          errMsg = 'SKU already exists in your catalog';
        }
        for (const row of chunk) {
          skipped++;
          results[row.index] = { sku: row.sku, status: 'skipped', error: errMsg };
        }
      } else {
        for (const row of chunk) {
          imported++;
          results[row.index] = { sku: row.sku, status: 'imported' };
        }
      }
    }

    return NextResponse.json({ imported, skipped, results }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
