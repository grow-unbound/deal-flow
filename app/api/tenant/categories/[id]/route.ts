import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { r2Url } from '@/lib/r2-url';
import { UpdateCategoryInputSchema } from '@/types/tenant-categories';
import type { CategoryDetailResponse } from '@/hooks/useCategories';

export const dynamic = 'force-dynamic';

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid category id') });

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParsed = IdParamsSchema.safeParse({ id });
  if (!idParsed.success) return jsonError(400, 'Invalid category id', 'VALIDATION');

  const claims = await getVerifiedClaims(request);
  const adminCheck = assertSellerAdmin(claims);
  if (!adminCheck.ok) {
    return jsonError(
      adminCheck.status,
      adminCheck.status === 401 ? 'Login required' : 'Forbidden',
      adminCheck.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
    );
  }

  const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id!);
  if (!flagEnabled) return jsonError(403, 'Feature not enabled', 'FORBIDDEN');

  const db = (await getRequestSupabaseClient()) as any;
  const tenantId = claims.tenant_id!;

  const { data: category, error: catErr } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id, tenant_id, name, slug, description, is_active, display_order, external_ref, r2_image_thumb_key, r2_image_original_key, r2_image_medium_key, deleted_at, created_at, updated_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (catErr || !category) {
    return jsonError(404, 'Category not found', 'NOT_FOUND');
  }

  const [detailV2Res, productsRes, activityRes] = await Promise.all([
    db.schema('app').rpc('get_seller_category_detail_v2', {
      p_tenant_id: tenantId,
      p_tenant_category_id: id,
    }),
    db
      .schema('app')
      .from('tenant_products')
      .select('id, internal_sku, name_override, tenant_brand_id, is_active, tenant_brands(id, display_name_override, logo_url, r2_logo_thumb_key)')
      .eq('tenant_id', tenantId)
      .eq('tenant_category_id', id)
      .is('deleted_at', null)
      .limit(200),
    db
      .schema('app')
      .from('audit_log')
      .select('id, action, actor_user_id, ts, diff')
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'tenant_category')
      .eq('entity_id', id)
      .order('ts', { ascending: false })
      .limit(20),
  ]);

  if (detailV2Res.error || productsRes.error || activityRes.error) {
    console.error('[GET /api/tenant/categories/[id]] V2 detail failed', detailV2Res.error ?? productsRes.error ?? activityRes.error);
    return jsonError(500, 'Failed to fetch category detail', 'ERROR');
  }

  const detailV2 = (detailV2Res.data ?? {}) as any;
  const kpiByLabel = new Map<string, any>((detailV2.kpi_grid ?? []).map((item: any) => [String(item.label), item.value]));
  const productsRaw: any[] = productsRes.data ?? [];
  const active_sku_count = productsRaw.filter((product) => product.is_active !== false).length;
  const brandIds = new Set(productsRaw.map((product) => product.tenant_brand_id).filter(Boolean));
  const productActionCard = (detailV2.performance_cards ?? []).find((card: any) => card.id === 'product-action-list');
  const brandContributionCard = (detailV2.performance_cards ?? []).find((card: any) => card.id === 'brand-contribution');
  const actionItems: any[] = productActionCard?.body?.items ?? [];
  const brandItems: any[] = brandContributionCard?.body?.items ?? [];
  const oos_sku_count = actionItems.filter((item) => String(item.supporting ?? '').toLowerCase().includes('out of stock')).length;
  const low_stock_sku_count = actionItems.filter((item) => String(item.supporting ?? '').toLowerCase().includes('low stock')).length;
  // product-action-list is capped at 20 items by get_seller_category_detail_v2 (v_limit
  // hard-clamped to 20), so oos/low_stock/sold counts above are only exact for
  // categories with <=20 products — a known approximation, not a bug introduced here.
  const sold_sku_count = actionItems.filter((item) => Number(item.value ?? 0) > 0).length;
  const gmv_mtd = Number(kpiByLabel.get('Invoiced sales 90D') ?? 0);
  const units_90d = Number(kpiByLabel.get('Units 90D') ?? 0);

  // Build base lookup maps
  const actionItemById = new Map<string, any>(actionItems.map((item) => [String(item.id), item]));
  const productSkuMap = new Map<string, string | null>(productsRaw.map((p) => [String(p.id), p.internal_sku ?? null]));
  const productBrandNameMap = new Map<string, string>(productsRaw.map((p) => [String(p.id), String(p.tenant_brands?.display_name_override ?? '—')]));
  const productToBrandId = new Map<string, string>(productsRaw.filter((p: any) => p.tenant_brand_id).map((p: any) => [String(p.id), String(p.tenant_brand_id)]));
  const brandProductCountMap = new Map<string, number>();
  for (const p of productsRaw) {
    if (p.tenant_brand_id) {
      brandProductCountMap.set(String(p.tenant_brand_id), (brandProductCountMap.get(String(p.tenant_brand_id)) ?? 0) + 1);
    }
  }

  // Parallel: product snapshots, tenant settings, brand logos for the brand-contribution items
  const productIds = productsRaw.map((p: any) => String(p.id));
  const brandIdsFromItems = brandItems.map((item: any) => String(item.id)).filter((bid: string) => bid.length === 36);

  const [snapshotRes, settingsRes, brandLogoRes] = await Promise.all([
    productIds.length > 0
      ? db.schema('app').from('metrics_product_snapshot')
          .select('tenant_product_id, available, out_of_stock, low_stock, days_cover, invoice_units_90d')
          .eq('tenant_id', tenantId)
          .in('tenant_product_id', productIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    db.schema('app').from('tenant_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    brandIdsFromItems.length > 0
      ? db.schema('app').from('tenant_brands')
          .select('id, logo_url, r2_logo_thumb_key, is_active')
          .eq('tenant_id', tenantId)
          .in('id', brandIdsFromItems)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Derive primary demand kind from settings
  const tenantSettings = (settingsRes as any).data?.settings ?? {};
  const primaryDemandKind: 'orders' | 'estimates' | 'none' =
    Boolean((tenantSettings as any)?.orders?.features?.sales_orders) ? 'orders' :
    Boolean((tenantSettings as any)?.orders?.features?.enquiries) ? 'estimates' : 'none';

  // Fetch demand items for last 90 days (orders or estimates)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let demandItems: Array<{ tenant_product_id: string; qty: number; line_total: number }> = [];
  if (primaryDemandKind !== 'none' && productIds.length > 0) {
    if (primaryDemandKind === 'orders') {
      const { data } = await db.schema('app')
        .from('order_items')
        .select('tenant_product_id, qty, line_total, orders!inner(tenant_id, status, placed_at, deleted_at)')
        .in('tenant_product_id', productIds)
        .is('deleted_at', null)
        .eq('orders.tenant_id', tenantId)
        .neq('orders.status', 'cancelled')
        .is('orders.deleted_at', null)
        .gte('orders.placed_at', ninetyDaysAgo);
      demandItems = (data ?? []).map((item: any) => ({
        tenant_product_id: String(item.tenant_product_id),
        qty: Number(item.qty ?? 0),
        line_total: Number(item.line_total ?? 0),
      }));
    } else {
      const { data } = await db.schema('app')
        .from('estimate_items')
        .select('tenant_product_id, qty, line_total, estimates!inner(tenant_id, status, created_at, deleted_at)')
        .in('tenant_product_id', productIds)
        .is('deleted_at', null)
        .eq('estimates.tenant_id', tenantId)
        .neq('estimates.status', 'cancelled')
        .is('estimates.deleted_at', null)
        .gte('estimates.created_at', ninetyDaysAgo);
      demandItems = (data ?? []).map((item: any) => ({
        tenant_product_id: String(item.tenant_product_id),
        qty: Number(item.qty ?? 0),
        line_total: Number(item.line_total ?? 0),
      }));
    }
  }

  // Build derived maps
  const snapshotByProduct = new Map<string, any>(
    ((snapshotRes as any).data ?? []).map((s: any) => [String(s.tenant_product_id), s])
  );
  const brandLogoMap = new Map<string, string | null>(
    ((brandLogoRes as any).data ?? []).map((b: any) => [
      String(b.id),
      r2Url(b.r2_logo_thumb_key) ?? b.logo_url ?? null,
    ])
  );
  const brandActiveMap = new Map<string, boolean>(
    ((brandLogoRes as any).data ?? []).map((b: any) => [String(b.id), b.is_active !== false])
  );

  // Aggregate brand-level invoice units (from snapshots) and demand (from orders/estimates)
  const brandInvoiceUnits = new Map<string, number>();
  for (const [productId, snapshot] of snapshotByProduct) {
    const brandId = productToBrandId.get(productId);
    if (brandId) {
      brandInvoiceUnits.set(brandId, (brandInvoiceUnits.get(brandId) ?? 0) + Number(snapshot.invoice_units_90d ?? 0));
    }
  }
  const brandDemandValue = new Map<string, number>();
  const brandDemandUnits = new Map<string, number>();
  for (const item of demandItems) {
    const brandId = productToBrandId.get(item.tenant_product_id);
    if (brandId) {
      brandDemandValue.set(brandId, (brandDemandValue.get(brandId) ?? 0) + item.line_total);
      brandDemandUnits.set(brandId, (brandDemandUnits.get(brandId) ?? 0) + item.qty);
    }
  }

  // Enrich performance_cards: add meta (SKU for products, product count for brands)
  const enrichedPerformanceCards = (detailV2.performance_cards ?? []).map((card: any) => {
    if (card.id === 'product-action-list' && Array.isArray(card.body?.items)) {
      return {
        ...card,
        body: {
          ...card.body,
          items: card.body.items.map((item: any) => ({
            ...item,
            meta: productSkuMap.get(String(item.id)) ?? null,
          })),
        },
      };
    }
    if (card.id === 'brand-contribution' && Array.isArray(card.body?.items)) {
      return {
        ...card,
        body: {
          ...card.body,
          items: card.body.items.map((item: any) => ({
            ...item,
            meta: `${brandProductCountMap.get(String(item.id)) ?? 0} products`,
          })),
        },
      };
    }
    return card;
  });

  const response: CategoryDetailResponse & { performance_cards: any[]; detail_v2: any } = {
    header: {
      ...category,
      initials: getInitials(category.name),
      active_sku_count,
      brand_count: brandIds.size,
    },
    meta_strip_4: {
      gmv_mtd,
      // get_seller_category_detail_v2 does not compute a prior-period comparison, so
      // growth_pct was previously always 0 — a fabricated "flat" badge, not real data.
      // product_count is a real, doc-recommended supporting value (see doc line 962).
      product_count: active_sku_count,
      units_90d,
      sold_sku_count,
      active_sku_count,
      oos_sku_count,
      low_stock_sku_count,
    },
    overview: {
      trend_weekly: [],
      stock_health: {
        active_sku_count,
        oos_sku_count,
        low_stock_sku_count,
        uncovered_sku_count: 0,
      },
      top_brands: brandItems.slice(0, 5).map((item) => ({
        id: String(item.id),
        name: String(item.label ?? 'Brand'),
        initials: getInitials(String(item.label ?? 'Brand')),
        units_mtd: 0,
        gmv_mtd: Number(item.value ?? 0),
      })),
    },
    // Build products from productsRaw, enriched with snapshot data and action item GMV
    products: productsRaw.map((p: any) => {
      const snapshot = snapshotByProduct.get(String(p.id));
      const actionItem = actionItemById.get(String(p.id));
      const brandLogo = r2Url((p.tenant_brands as any)?.r2_logo_thumb_key) ?? (p.tenant_brands as any)?.logo_url ?? null;
      return {
        id: String(p.id),
        name: String(p.name_override ?? p.internal_sku ?? 'Unknown'),
        sku_code: p.internal_sku ?? null,
        brand_id: String(p.tenant_brand_id ?? ''),
        brand_name: productBrandNameMap.get(String(p.id)) ?? '—',
        brand_logo_url: brandLogo,
        on_hand: snapshot ? Number(snapshot.available ?? 0) : 0,
        days_cover: snapshot?.days_cover != null ? Number(snapshot.days_cover) : null,
        units_mtd: snapshot ? Number(snapshot.invoice_units_90d ?? 0) : 0,
        gmv_mtd: Number(actionItem?.value ?? 0),
        is_active: p.is_active !== false,
      };
    }),
    brands: brandItems.map((item: any) => ({
      id: String(item.id),
      name: String(item.label ?? 'Brand'),
      initials: getInitials(String(item.label ?? 'Brand')),
      logo_url: brandLogoMap.get(String(item.id)) ?? null,
      sku_count: brandProductCountMap.get(String(item.id)) ?? 0,
      gmv_mtd: Number(item.value ?? 0),
      units_90d: brandInvoiceUnits.get(String(item.id)) ?? 0,
      demand_90d: brandDemandValue.get(String(item.id)) ?? 0,
      demand_units_90d: brandDemandUnits.get(String(item.id)) ?? 0,
      growth_pct: 0,
      is_active: brandActiveMap.get(String(item.id)) ?? true,
    })),
    activity: (activityRes.data ?? []).map((row: any) => ({
      id: row.id,
      action: row.action,
      actor_name: row.actor_user_id ?? 'System',
      ts: row.ts,
      diff: row.diff,
    })),
    performance_cards: enrichedPerformanceCards,
    detail_v2: detailV2,
  };

  return NextResponse.json({ data: response }, { headers: SELLER_CACHE_PERSONAL });
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = IdParamsSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError(400, idParsed.error.issues[0]?.message ?? 'Invalid id', 'VALIDATION');
  }

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }
    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Only seller_admin can update categories', 'FORBIDDEN');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');
    }

    const parsed = UpdateCategoryInputSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid body';
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message: msg, details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    const db = (await getRequestSupabaseClient()) as any;
    const nowIso = new Date().toISOString();

    const { data: row, error: loadErr } = await db
      .schema('app')
      .from('tenant_categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (loadErr || !row) {
      return jsonError(404, 'Category not found', 'NOT_FOUND');
    }

    if (patch.reactivate) {
      if (!row.deleted_at) {
        return jsonError(400, 'Category is already active', 'VALIDATION');
      }
      const { data: updated, error: upErr } = await db
        .schema('app')
        .from('tenant_categories')
        .update({ deleted_at: null, updated_at: nowIso, updated_by: claims.sub })
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id)
        .select()
        .single();

      if (upErr || !updated) {
        return jsonError(500, 'Failed to reactivate category', 'UPDATE_FAILED');
      }

      await db.schema('app').from('audit_log').insert({
        tenant_id: claims.tenant_id,
        actor_user_id: claims.sub,
        entity_type: 'tenant_category',
        entity_id: id,
        action: 'update',
        diff: { reactivated: true },
        ts: nowIso,
      });

      return NextResponse.json({ data: { category: updated }, error: null }, { status: 200 });
    }

    // Check slug uniqueness if changing slug
    if (patch.slug && patch.slug !== row.slug) {
      const { data: slugConflict } = await db
        .schema('app')
        .from('tenant_categories')
        .select('id')
        .eq('tenant_id', claims.tenant_id)
        .eq('slug', patch.slug)
        .is('deleted_at', null)
        .neq('id', id)
        .maybeSingle();

      if (slugConflict) {
        return jsonError(409, 'A category with this slug already exists', 'CONFLICT');
      }
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: nowIso,
      updated_by: claims.sub,
    };

    if (patch.name !== undefined) updatePayload.name = patch.name.trim();
    if (patch.slug !== undefined) updatePayload.slug = patch.slug.trim();
    if (patch.description !== undefined) updatePayload.description = patch.description?.trim() ?? null;
    if (patch.display_order !== undefined) updatePayload.display_order = patch.display_order;
    if (patch.is_active !== undefined) updatePayload.is_active = patch.is_active;
    if (patch.external_ref !== undefined) {
      updatePayload.external_ref =
        patch.external_ref === null || patch.external_ref.trim() === '' ? null : patch.external_ref.trim();
    }
    if (patch.r2_image_original_key !== undefined) updatePayload.r2_image_original_key = patch.r2_image_original_key;
    if (patch.r2_image_medium_key !== undefined) updatePayload.r2_image_medium_key = patch.r2_image_medium_key;
    if (patch.r2_image_thumb_key !== undefined) updatePayload.r2_image_thumb_key = patch.r2_image_thumb_key;

    const { data: updated, error: upErr } = await db
      .schema('app')
      .from('tenant_categories')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .select()
      .single();

    if (upErr || !updated) {
      console.error('[PATCH /api/tenant/categories/[id]]', upErr);
      return jsonError(500, 'Failed to update category', 'UPDATE_FAILED');
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'tenant_category',
      entity_id: id,
      action: 'update',
      diff: patch,
      ts: nowIso,
    });

    return NextResponse.json({ data: { category: updated }, error: null }, { status: 200 });
  } catch (e) {
    console.error('[PATCH /api/tenant/categories/[id]]', e);
    return jsonError(500, 'Internal server error', 'SERVER_ERROR');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = IdParamsSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError(400, idParsed.error.issues[0]?.message ?? 'Invalid id', 'VALIDATION');
  }

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }
    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Only seller_admin can deactivate categories', 'FORBIDDEN');
    }

    const db = (await getRequestSupabaseClient()) as any;
    const nowIso = new Date().toISOString();

    const { data: row, error: loadErr } = await db
      .schema('app')
      .from('tenant_categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (loadErr || !row) {
      return jsonError(404, 'Category not found', 'NOT_FOUND');
    }

    // Guard: cannot deactivate if products reference this category
    const { data: linked } = await db
      .schema('app')
      .from('tenant_products')
      .select('id')
      .eq('tenant_category_id', id)
      .is('deleted_at', null)
      .limit(1);

    if ((linked?.length ?? 0) > 0) {
      return jsonError(
        409,
        'Cannot deactivate this category while products are assigned to it. Reassign those products first.',
        'CONFLICT',
      );
    }

    const { error: delErr } = await db
      .schema('app')
      .from('tenant_categories')
      .update({
        deleted_at: nowIso,
        updated_at: nowIso,
        updated_by: claims.sub,
        is_active: false,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (delErr) {
      console.error('[DELETE /api/tenant/categories/[id]]', delErr);
      return jsonError(500, 'Failed to deactivate category', 'UPDATE_FAILED');
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'tenant_category',
      entity_id: id,
      action: 'delete',
      diff: { soft_deleted: true, name: row.name },
      ts: nowIso,
    });

    return NextResponse.json({ data: { id }, error: null }, { status: 200 });
  } catch (e) {
    console.error('[DELETE /api/tenant/categories/[id]]', e);
    return jsonError(500, 'Internal server error', 'SERVER_ERROR');
  }
}
