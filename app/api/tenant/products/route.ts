import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { createTimer } from '@/lib/server-timing';
import { resolveImportedProductTenantLinks } from '@/lib/server/tenant-product-source-resolution';
import { z } from 'zod';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { PAGE_SIZE } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam } from '@/lib/landing-filter-params';

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
  hsn_code: z.string().optional(),
  gst_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  description: z.string().optional(),
  category_name: z.string().optional(),
  tenant_category_id: z.string().uuid().optional().nullable(),
  attributes: z.record(z.string()).optional().default({}),
  image_urls: z.array(z.string().url()).optional().default([]),
});

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'products_api', init, APP_GET_CACHE_CONTROL);
  };
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries
    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];
    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));

    const reqLimit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const search = req.nextUrl.searchParams.get('search')?.trim() || null;
    const brandParams = readArrayParam(req.nextUrl.searchParams, 'brand');
    const categoryParams = readArrayParam(req.nextUrl.searchParams, 'category');
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const stockParams = readArrayParam(req.nextUrl.searchParams, 'stock');

    const decodedCursor = (() => {
      if (!cursorParam) return null;
      try {
        const parsed = JSON.parse(Buffer.from(cursorParam, 'base64url').toString()) as { t?: string; i?: string };
        return parsed.t && parsed.i ? parsed : null;
      } catch {
        return null;
      }
    })();

    const v2ProductsRes = await db.schema('app').rpc('metrics_v2_products_landing', {
      p_tenant_id: tenantId,
      p_location_ids: isAssistant ? assistantLocationIds : null,
      p_query: search,
      p_brand_names: brandParams.length > 0 ? brandParams : null,
      p_category_names: categoryParams.length > 0 ? categoryParams : null,
      p_statuses: statusParams.length > 0 ? statusParams : null,
      p_stock: stockParams.length > 0 ? stockParams : null,
      p_limit: reqLimit,
      p_cursor_created_at: decodedCursor?.t ?? null,
      p_cursor_id: decodedCursor?.i ?? null,
    });

    if (v2ProductsRes.error) {
      console.error('[GET /api/tenant/products] metrics v2 landing error:', v2ProductsRes.error.code, v2ProductsRes.error.message);
      return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const v2Payload = (v2ProductsRes.data ?? {}) as Record<string, unknown>;
    const rawNextCursor = v2Payload.nextCursor as { t?: string; i?: string } | null | undefined;
    return timedJson({
      period,
      ...v2Payload,
      nextCursor: rawNextCursor?.t && rawNextCursor?.i
        ? Buffer.from(JSON.stringify(rawNextCursor)).toString('base64url')
        : null,
    });

  } catch (err) {
    console.error('[GET /api/tenant/products] Unexpected error:', err);
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
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
      hsn_code,
      gst_rate,
      description,
      tenant_category_id,
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
    const actorUserId = claims.sub ?? claims.tenant_id;

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

    let resolvedTenantBrandId = providedTenantBrandId ?? null;
    let resolvedTenantCategoryId = tenant_category_id ?? null;

    if (master_product_id) {
      let importedLinks: Awaited<ReturnType<typeof resolveImportedProductTenantLinks>> = null;
      try {
        importedLinks = await resolveImportedProductTenantLinks(db, tenantId, actorUserId, master_product_id, {
          tenant_brand_id: resolvedTenantBrandId,
          tenant_category_id: resolvedTenantCategoryId,
        });
      } catch (resolutionError) {
        console.error('[POST /api/tenant/products] failed to resolve imported product links:', resolutionError);
        return NextResponse.json(
          { error: 'Failed to resolve imported brand/category links' },
          { status: 500 },
        );
      }

      if (importedLinks) {
        resolvedTenantBrandId = importedLinks.tenant_brand_id;
        resolvedTenantCategoryId = importedLinks.tenant_category_id;
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
        name_override: name_override?.trim() || name?.trim() || null,
        mrp,
        base_selling_price,
        cost_price: effectiveCostPrice,
        default_uom: default_uom ?? null,
        pack_size: pack_size ?? null,
        hsn_code: hsn_code ?? null,
        gst_rate: gst_rate ?? null,
        description: description ?? null,
        tenant_category_id: resolvedTenantCategoryId,
        attributes_override: attributes ?? {},
        image_urls: image_urls ?? [],
        is_active: true,
        created_by: actorUserId,
        updated_by: actorUserId,
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
