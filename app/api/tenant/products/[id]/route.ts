import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { resolveImportedProductTenantLinks } from '@/lib/server/tenant-product-source-resolution';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { chunkArray, POSTGREST_IN_CHUNK_SIZE } from '@/lib/server/warehouse-data';
import { getPriceListStatus, type PriceListStatus } from '@/lib/utils';
import { z } from 'zod';

const PRODUCT_PRICELIST_ROWS_LIMIT = 200;

type ProductPricingRow = {
  price_list_id: string;
  price_list_name: string;
  item_id: string | null;
  list_price: number | null;
  effective_price: number | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  is_active: boolean;
  is_managed_externally: boolean;
  status: PriceListStatus;
  avg_discount_pct: number | null;
  avg_margin_pct: number | null;
};

async function loadProductPricingRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  productId: string,
): Promise<ProductPricingRow[]> {
  const flagEnabled = await getFlag('df_pricing_engine', tenantId);
  if (!flagEnabled) return [];

  const { data: priceLists, error: listError } = await db
    .schema('app')
    .from('price_lists')
    .select('id, name, valid_from, valid_to, is_active, external_ref, priority, created_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('name', { ascending: true })
    .limit(PRODUCT_PRICELIST_ROWS_LIMIT);

  if (listError || !priceLists?.length) return [];

  const listIds = priceLists.map((row: { id: string }) => row.id);
  const itemByListId = new Map<string, { id: string; price: number }>();

  for (const idChunk of chunkArray(listIds, POSTGREST_IN_CHUNK_SIZE)) {
    const { data: items } = await db
      .schema('app')
      .from('price_list_items')
      .select('id, price_list_id, price')
      .eq('tenant_product_id', productId)
      .in('price_list_id', idChunk)
      .is('deleted_at', null);

    for (const item of items ?? []) {
      itemByListId.set(item.price_list_id, { id: item.id, price: Number(item.price) });
    }
  }

  const { data: aggregateData } = await db.schema('app').rpc('get_seller_price_list_landing_aggregates', {
    p_tenant_id: tenantId,
    p_page_ids: listIds,
    p_include_summary: false,
    p_now: new Date().toISOString(),
  });
  const metricsById = new Map<string, { avg_discount_pct: number | string | null; avg_margin_pct: number | string | null }>(
    ((aggregateData as { row_metrics?: Array<{ id: string; avg_discount_pct: number | string | null; avg_margin_pct: number | string | null }> } | null)?.row_metrics ?? []).map(
      (metric) => [metric.id, metric],
    ),
  );

  return priceLists.map((pl: {
    id: string;
    name: string;
    valid_from: string | null;
    valid_to: string | null;
    created_at: string;
    is_active: boolean;
    external_ref: string | null;
  }) => {
    const matched = itemByListId.get(pl.id);
    const listPrice = matched != null ? matched.price : null;
    const metric = metricsById.get(pl.id);
    const status = getPriceListStatus({
      is_active: Boolean(pl.is_active),
      valid_from: pl.valid_from,
      valid_to: pl.valid_to,
    });
    return {
      price_list_id: pl.id,
      price_list_name: pl.name ?? '',
      item_id: matched?.id ?? null,
      list_price: listPrice,
      effective_price: listPrice,
      valid_from: pl.valid_from,
      valid_to: pl.valid_to,
      created_at: pl.created_at,
      is_active: Boolean(pl.is_active),
      is_managed_externally: Boolean(pl.external_ref),
      status,
      avg_discount_pct: metric?.avg_discount_pct == null ? null : Number(metric.avg_discount_pct),
      avg_margin_pct: metric?.avg_margin_pct == null ? null : Number(metric.avg_margin_pct),
    };
  });
}

const UpdateProductSchema = z.object({
  internal_sku: z.string().min(1, 'Internal SKU is required').optional(),
  name: z.string().min(1, 'Product name is required').optional(),
  name_override: z.string().optional(),
  mrp: z.coerce.number().positive('MRP must be positive').optional(),
  base_selling_price: z.coerce.number().positive('Base selling price must be positive').optional(),
  cost_price: z.coerce.number().positive().optional().nullable(),
  tenant_brand_id: z.string().uuid().optional().nullable(),
  default_uom: z.string().optional().nullable(),
  pack_size: z.coerce.number().positive().optional().nullable(),
  hsn_code: z.string().optional().nullable(),
  gst_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  category_name: z.string().optional().nullable(),
  tenant_category_id: z.string().uuid().optional().nullable(),
  external_ref: z.string().optional().nullable(),
  attributes_override: z.record(z.string()).optional(),
  image_urls: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  archive: z.boolean().optional(),
});

function computeDiff(
  oldProduct: Record<string, unknown>,
  newFields: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, newVal] of Object.entries(newFields)) {
    if (oldProduct[key] !== newVal) {
      diff[key] = { from: oldProduct[key], to: newVal };
    }
  }
  return diff;
}

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    startIso: start.toISOString(),
    nextIso: next.toISOString(),
    prevStartIso: prevStart.toISOString(),
    prevEndIso: prevEnd.toISOString(),
  };
}

function isOperationalInvoiceStatus(status: string | null | undefined) {
  const value = (status ?? '').toLowerCase();
  return !['draft', 'void', 'cancelled', 'rejected', 'archived'].includes(value);
}


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const includePerformance = req.nextUrl.searchParams.get('include_performance') !== 'false';
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

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;

    const { data: product, error: productError } = await db
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
        tenant_category_id,
        hsn_code,
        gst_rate,
        description,
        attributes_override,
        image_urls,
        is_active,
        external_ref,
        created_at,
        updated_at
      `)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (productError) {
      return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const [detailV2Res, masterProductRes, tenantBrandRes, tenantCategoryRes] = await Promise.all([
      db.schema('app').rpc('get_seller_product_detail_v2', {
        p_tenant_id: tenantId,
        p_tenant_product_id: id,
      }),
      product.master_product_id
        ? db.schema('catalog').from('products').select('id, name, master_sku, hsn_code, gst_rate, pack_size, categories(name), brands(name)').eq('id', product.master_product_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      product.tenant_brand_id
        ? db.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').eq('id', product.tenant_brand_id).eq('tenant_id', tenantId).is('deleted_at', null).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      product.tenant_category_id
        ? db.schema('app').from('tenant_categories').select('id, name').eq('id', product.tenant_category_id).eq('tenant_id', tenantId).is('deleted_at', null).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (detailV2Res.error) {
      console.error('[GET /api/tenant/products/[id]] get_seller_product_detail_v2 failed', detailV2Res.error);
      return NextResponse.json({ error: 'Failed to fetch product detail' }, { status: 500 });
    }

    const detailV2 = (detailV2Res.data ?? {}) as any;
    const v2Header = detailV2.header ?? {};
    const kpiByLabel = new Map<string, any>((detailV2.kpi_grid ?? []).map((item: any) => [String(item.label), item.value]));
    const displayName = product.name_override ?? masterProductRes.data?.name ?? product.internal_sku;
    const brandName = tenantBrandRes.data?.display_name_override ?? masterProductRes.data?.brands?.name ?? 'Unbranded';
    const available = Number(kpiByLabel.get('Available') ?? 0);
    const invoiceUnits90d = Number(kpiByLabel.get('Units sold 90D') ?? 0);
    const invoiceValue90d = Number(kpiByLabel.get('Invoiced sales 90D') ?? 0);
    const daysCover = kpiByLabel.get('Days cover') == null ? null : Number(kpiByLabel.get('Days cover'));
    const pricingRows = await loadProductPricingRows(db, tenantId, id);

    const detailResponse = {
      header: {
        id: product.id,
        name: v2Header.title ?? displayName,
        brand: brandName,
        sku: product.internal_sku,
        pack: product.pack_size ? `${product.pack_size} ${product.default_uom ?? ''}`.trim() : product.default_uom ?? '—',
        mrp: Number(product.mrp ?? 0),
        status_label: !product.is_active ? 'Inactive' : available <= 0 ? 'Out of stock' : daysCover != null && daysCover < 14 ? 'Low stock' : 'On pace',
        status_tone: !product.is_active ? 'neutral' : available <= 0 ? 'danger' : daysCover != null && daysCover < 14 ? 'warning' : 'success',
      },
      meta_strip_4: {
        units_mtd: invoiceUnits90d,
        days_cover: daysCover ?? 0,
        on_hand: available,
        sell_through_pct: available + invoiceUnits90d > 0 ? Math.round((invoiceUnits90d / (available + invoiceUnits90d)) * 100) : 0,
      },
      details: {
        id: product.id,
        name: displayName,
        sku: product.internal_sku,
        category: tenantCategoryRes.data?.name ?? masterProductRes.data?.categories?.name ?? 'Uncategorized',
        pack_size: product.pack_size ?? masterProductRes.data?.pack_size ?? null,
        default_uom: product.default_uom,
        mrp: product.mrp,
        name_override: product.name_override,
        base_selling_price: product.base_selling_price,
        cost_price: claims.role === 'seller_admin' ? product.cost_price : null,
        external_ref: product.external_ref,
        is_active: product.is_active,
        hsn_code: product.hsn_code ?? masterProductRes.data?.hsn_code ?? null,
        gst_rate: product.gst_rate ?? masterProductRes.data?.gst_rate ?? null,
        description: product.description ?? null,
        updated_at: product.updated_at,
      },
      performance_cards: includePerformance ? (detailV2.performance_cards ?? []) : [],
      detail_v2: includePerformance ? detailV2 : null,
      performance: {
        monthly_units_trend: [],
        inventory_ops: {
          on_hand: available,
          days_cover: daysCover,
          sell_through_pct: available + invoiceUnits90d > 0 ? Math.round((invoiceUnits90d / (available + invoiceUnits90d)) * 100) : 0,
          last_ordered_at: null,
          last_ordered_buyer: null,
        },
        top_buyers: [],
        price_by_cohort: [{ cohort: 'All buyers (base)', price: Number(product.base_selling_price ?? 0), has_override: false }],
        units_snapshot: { units_mtd: invoiceUnits90d, revenue_last_30d: Math.round(invoiceValue90d) },
      },
      pricing_summary: {
        mrp: product.mrp,
        base_selling_price: product.base_selling_price,
        cost_price: claims.role === 'seller_admin' ? product.cost_price : null,
        margin_pct: product.base_selling_price && product.cost_price ? Number((((product.base_selling_price - product.cost_price) / product.base_selling_price) * 100).toFixed(1)) : null,
      },
      pricing: pricingRows,
      activity: [],
      role: claims.role,
    };

    const responseProduct = claims.role === 'seller_assistant'
      ? (() => {
          const { cost_price: _ignored, ...rest } = product;
          void _ignored;
          return rest;
        })()
      : product;

    return NextResponse.json({ product: responseProduct, detail: detailResponse }, { headers: SELLER_CACHE_PERSONAL });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const bodyWithoutSku = await req.json() as Record<string, unknown>;

    if (claims.role === 'seller_assistant') {
      delete (bodyWithoutSku as Record<string, unknown>).cost_price;
      delete (bodyWithoutSku as Record<string, unknown>).archive;
    }

    const parsed = UpdateProductSchema.safeParse(bodyWithoutSku);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updateFields = parsed.data;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const db = supabaseAdmin as any;

    const { data: current, error: fetchError } = await db
      .schema('app')
      .from('tenant_products')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
    }

    if (!current) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (
      updateFields.internal_sku &&
      updateFields.internal_sku !== current.internal_sku
    ) {
      const { data: skuMatch } = await db
        .schema('app')
        .from('tenant_products')
        .select('id')
        .eq('tenant_id', claims.tenant_id)
        .eq('internal_sku', updateFields.internal_sku)
        .is('deleted_at', null)
        .neq('id', id)
        .maybeSingle();

      if (skuMatch) {
        return NextResponse.json(
          { error: 'This SKU already exists in your product list.' },
          { status: 409 },
        );
      }
    }

    const patchPayload: Record<string, unknown> = {
      ...updateFields,
      updated_at: new Date().toISOString(),
    };

    if (updateFields.name_override !== undefined) {
      patchPayload.name_override = updateFields.name_override?.trim() || null;
    }

    if (updateFields.name !== undefined && updateFields.name_override === undefined) {
      patchPayload.name_override = updateFields.name?.trim() || null;
      delete patchPayload.name;
    }

    if (updateFields.external_ref !== undefined) {
      patchPayload.external_ref = updateFields.external_ref?.trim() || null;
    }

    if (Array.isArray(updateFields.image_urls) && updateFields.image_urls.length === 0) {
      patchPayload.r2_original_key = null;
      patchPayload.r2_large_key = null;
      patchPayload.r2_medium_key = null;
      patchPayload.r2_small_key = null;
      patchPayload.r2_thumb_key = null;
    }

    if (updateFields.archive) {
      patchPayload.deleted_at = new Date().toISOString();
      delete patchPayload.archive;
    }

    if (current.master_product_id) {
      let importedLinks: Awaited<ReturnType<typeof resolveImportedProductTenantLinks>> = null;
      try {
        importedLinks = await resolveImportedProductTenantLinks(db, claims.tenant_id, claims.sub ?? claims.tenant_id, current.master_product_id, {
          tenant_brand_id: typeof updateFields.tenant_brand_id === 'undefined' ? current.tenant_brand_id : updateFields.tenant_brand_id,
          tenant_category_id: typeof updateFields.tenant_category_id === 'undefined' ? current.tenant_category_id : updateFields.tenant_category_id,
        });
      } catch (resolutionError) {
        console.error('[PATCH /api/tenant/products/[id]] failed to resolve imported product links:', resolutionError);
        return NextResponse.json(
          { error: 'Failed to resolve imported brand/category links' },
          { status: 500 },
        );
      }

      if (importedLinks) {
        patchPayload.tenant_brand_id = importedLinks.tenant_brand_id;
        patchPayload.tenant_category_id = importedLinks.tenant_category_id;
      }
    }

    const diff = computeDiff(
      current as Record<string, unknown>,
      patchPayload as Record<string, unknown>,
    );

    const isStatusChangeOnly =
      Object.keys(updateFields).length === 1 && ('is_active' in updateFields || 'archive' in updateFields);
    const action = isStatusChangeOnly ? 'status_change' : 'update';

    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    let actorUserId: string | null = null;
    if (token) {
      const {
        data: { user },
      } = await (supabaseAdmin as any).auth.getUser(token);
      actorUserId = user?.id ?? null;
    }

    const { data: updated, error: updateError } = await db
      .schema('app')
      .from('tenant_products')
      .update({
        ...patchPayload,
        updated_by: actorUserId ?? claims.tenant_id,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }

    if (Object.keys(diff).length > 0) {
      await db
        .schema('app')
        .from('audit_log')
        .insert({
          tenant_id: claims.tenant_id,
          actor_user_id: actorUserId,
          entity_type: 'tenant_product',
          entity_id: id,
          action,
          diff,
        });
    }

    return NextResponse.json({ product: updated });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
