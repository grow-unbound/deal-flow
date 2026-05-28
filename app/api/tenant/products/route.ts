import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

const AddProductSchema = z.object({
  master_product_id: z.string().uuid('Invalid product ID').optional().nullable(),
  internal_sku: z.string().min(1, 'Internal SKU is required'),
  name: z.string().min(1).optional(),
  mrp: z.coerce.number().positive('MRP must be positive'),
  base_selling_price: z.coerce.number().positive('Base selling price must be positive'),
  cost_price: z.coerce.number().positive().optional().nullable(),
  tenant_brand_id: z.string().uuid().optional(),
  name_override: z.string().optional(),
  default_uom: z.string().optional(),
  pack_size: z.coerce.number().positive().optional().nullable(),
  // hsn_code: z.string().optional(),
  // gst_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  attributes: z.record(z.string()).optional().default({}),
  image_urls: z.array(z.string().url()).optional().default([]),
});

export async function GET(req: NextRequest) {
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

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    const { data, error } = await db
      .schema('app')
      .from('tenant_products')
      .select(`
        id,
        tenant_id,
        tenant_brand_id,
        master_product_id,
        internal_sku,
        name_override,
        mrp,
        base_selling_price,
        cost_price,
        default_uom,
        pack_size,
        image_urls,
        is_active,
        external_ref,
        created_at,
        updated_at
      `)
      .eq('tenant_id', claims.tenant_id)
      .is('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/tenant/products] DB error:', error.code, error.message, error.details);
      return NextResponse.json(
        { error: 'Failed to fetch products', code: error.code, detail: error.message },
        { status: 500 },
      );
    }

    // Fetch master product details for enrichment
    const masterProductIds = (data ?? [])
      .filter((r: { master_product_id: string | null }) => r.master_product_id)
      .map((r: { master_product_id: string }) => r.master_product_id);

    let masterProducts: Record<
      string,
      {
        id: string;
        name: string;
        master_sku: string;
        // gst_rate: number | null;
        // hsn_code: string | null;
        brand_id: string;
        brands: { id: string; name: string; slug: string; logo_url: string | null } | null;
      }
    > = {};

    if (masterProductIds.length > 0) {
      const { data: catalogProducts } = await db
        .schema('catalog')
        .from('products')
        .select('id, name, master_sku, brand_id, brands!inner(id, name, slug, logo_url)') // gst_rate, hsn_code left out for now
        .in('id', masterProductIds);

      masterProducts = Object.fromEntries(
        (catalogProducts ?? []).map(
          (p: {
            id: string;
            name: string;
            master_sku: string;
            // gst_rate: number | null;
            // hsn_code: string | null;
            brand_id: string;
            brands: { id: string; name: string; slug: string; logo_url: string | null } | null;
          }) => [p.id, p]
        )
      );
    }

    const role = claims.role;

    const products = (data ?? []).map(
      (row: {
        id: string;
        tenant_id: string;
        tenant_brand_id: string | null;
        master_product_id: string | null;
        internal_sku: string;
        name_override: string | null;
        mrp: number | null;
        base_selling_price: number | null;
        cost_price: number | null;
        default_uom: string | null;
        pack_size: number | null;
        image_urls: string[] | null;
        is_active: boolean;
        external_ref: string | null;
        created_at: string;
        updated_at: string;
      }) => {
        const master = row.master_product_id ? masterProducts[row.master_product_id] : null;
        const enriched = {
          ...row,
          master_product: master ?? null,
          display_name: row.name_override ?? master?.name ?? row.internal_sku,
          brand_name: master?.brands?.name ?? null,
        };

        // Strip cost_price for seller_assistant role
        if (role === 'seller_assistant') {
          const { cost_price: _stripped, ...rest } = enriched;
          void _stripped;
          return rest;
        }

        return enriched;
      }
    );

    return NextResponse.json({ products });
  } catch (err) {
    console.error('[GET /api/tenant/products] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

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
    const parsed = AddProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      master_product_id,
      internal_sku,
      name,
      mrp,
      base_selling_price,
      cost_price,
      tenant_brand_id: providedTenantBrandId,
      name_override,
      default_uom,
      pack_size,
      // hsn_code,
      // gst_rate,
      attributes,
      image_urls,
    } = parsed.data;

    // For custom products (master_product_id = null), tenant_brand_id is required
    if (!master_product_id && !providedTenantBrandId) {
      return NextResponse.json(
        { error: 'tenant_brand_id is required for custom products' },
        { status: 400 }
      );
    }

    // seller_assistant cannot set cost_price
    const effectiveCostPrice =
      claims.role === 'seller_assistant' ? null : (cost_price ?? null);

    const tenantId = claims.tenant_id;

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    // Check internal_sku uniqueness within tenant
    const { data: existing } = await db
      .schema('app')
      .from('tenant_products')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('internal_sku', internal_sku)
      .is('is_active', true)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This SKU already exists in your product list.' },
        { status: 409 }
      );
    }

    // Resolve tenant_brand_id if not provided
    let resolvedTenantBrandId = providedTenantBrandId ?? null;

    if (!resolvedTenantBrandId && master_product_id) {
      // Look up brand_id from catalog product
      const { data: catalogProduct } = await db
        .schema('catalog')
        .from('products')
        .select('brand_id')
        .eq('id', master_product_id)
        .maybeSingle();

      if (catalogProduct?.brand_id) {
        // Find matching tenant_brand
        const { data: tenantBrand } = await db
          .schema('app')
          .from('tenant_brands')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('master_brand_id', catalogProduct.brand_id)
          .is('is_active', true)
          .maybeSingle();

        resolvedTenantBrandId = tenantBrand?.id ?? null;
      }
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('tenant_products')
      .insert({
        tenant_id: tenantId,
        tenant_brand_id: resolvedTenantBrandId,
        master_product_id: master_product_id ?? null,
        internal_sku,
        name_override: name_override ?? name ?? null,
        mrp,
        base_selling_price,
        cost_price: effectiveCostPrice,
        default_uom: default_uom ?? null,
        pack_size: pack_size ?? null,
        // hsn_code: hsn_code ?? null,
        // gst_rate: gst_rate ?? null, 
        attributes_override: attributes ?? {},
        image_urls: image_urls ?? [],
        is_active: true,
        created_by: tenantId,
        updated_by: tenantId,
      })
      .select()
      .single();

    if (insertError) {
      // Unique constraint violation (race condition on internal_sku)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'This SKU already exists in your product list.' },
          { status: 409 }
        );
      }
      console.error('[POST /api/tenant/products] DB error:', insertError.code, insertError.message);
      return NextResponse.json(
        { error: 'Failed to add product', code: insertError.code, detail: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ product: inserted }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tenant/products] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
