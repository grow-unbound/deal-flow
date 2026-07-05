import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
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
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized', 'UNAUTHORIZED');
  if (!claims.role?.startsWith('seller_')) return jsonError(403, 'Forbidden', 'FORBIDDEN');

  const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
  if (!flagEnabled) return jsonError(403, 'Feature not enabled', 'FORBIDDEN');

  const db = supabaseAdmin as any;
  const tenantId = claims.tenant_id;

  // Cross-tenant guard
  const { data: category, error: catErr } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id, tenant_id, name, slug, description, is_active, display_order, external_ref, r2_image_thumb_key, r2_image_original_key, r2_image_medium_key, deleted_at, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (catErr || !category || category.tenant_id !== tenantId) {
    return jsonError(404, 'Category not found', 'NOT_FOUND');
  }

  const period = getSellerLandingPeriodMeta(request.nextUrl.searchParams.get('period'));

  // 6 weeks back for trend chart
  const sixWeeksAgo = new Date();
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
  const sixWeeksStr = sixWeeksAgo.toISOString().split('T')[0];

  // 30 days for days_cover
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0];

  const [
    currentKpiRes,
    prevKpiRes,
    trendRes,
    productsRes,
    unitsRes,
    activityRes,
  ] = await Promise.all([
    // Current period GMV + buyers (for meta_strip_4)
    db.schema('app').from('kpi_category_daily')
      .select('gmv, units_sold, buyers_count')
      .eq('tenant_id', tenantId)
      .eq('tenant_category_id', id)
      .gte('day', period.current_start.split('T')[0])
      .lt('day', period.current_end_exclusive.split('T')[0]),

    // Previous period GMV (for growth %)
    db.schema('app').from('kpi_category_daily')
      .select('gmv')
      .eq('tenant_id', tenantId)
      .eq('tenant_category_id', id)
      .gte('day', period.previous_start.split('T')[0])
      .lt('day', period.previous_end_exclusive.split('T')[0]),

    // 6-week daily rows for trend chart (grouped by week in JS)
    db.schema('app').from('kpi_category_daily')
      .select('day, gmv, units_sold')
      .eq('tenant_id', tenantId)
      .eq('tenant_category_id', id)
      .gte('day', sixWeeksStr)
      .order('day', { ascending: true }),

    // Products in this category with inventory
    db.schema('app').from('tenant_products')
      .select('id, name, sku_code, tenant_brand_id, is_active, deleted_at, tenant_brands(name), tenant_inventory(qty_available, reorder_point)')
      .eq('tenant_id', tenantId)
      .eq('tenant_category_id', id)
      .is('deleted_at', null)
      .order('name', { ascending: true }),

    // Last 30d units per product in this category
    db.schema('app').from('kpi_product_daily')
      .select('tenant_product_id, units_sold, gmv')
      .eq('tenant_id', tenantId)
      .gte('day', thirtyDaysStr),

    // Activity log for this category
    db.schema('app').from('audit_log')
      .select('id, action, actor_user_id, ts, diff, tenant_users(display_name)')
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'tenant_category')
      .eq('entity_id', id)
      .order('ts', { ascending: false })
      .limit(50),
  ]);

  // Aggregate current period
  const currentRows = (currentKpiRes.data ?? []) as Array<{ gmv: number; units_sold: number; buyers_count: number }>;
  const gmv_mtd = currentRows.reduce((s, r) => s + Number(r.gmv ?? 0), 0);
  const active_buyer_count = currentRows.reduce((s, r) => s + Number(r.buyers_count ?? 0), 0);

  const prevRows = (prevKpiRes.data ?? []) as Array<{ gmv: number }>;
  const gmv_prev = prevRows.reduce((s, r) => s + Number(r.gmv ?? 0), 0);
  const growth_pct = gmv_prev > 0 ? Math.round(((gmv_mtd - gmv_prev) / gmv_prev) * 100) : 0;

  // Trend chart: group daily rows by ISO week
  const trendRows = (trendRes.data ?? []) as Array<{ day: string; gmv: number; units_sold: number }>;
  const weekMap = new Map<string, { gmv: number; units: number }>();
  for (const row of trendRows) {
    const d = new Date(row.day + 'T00:00:00Z');
    // ISO week: find Monday
    const dayOfWeek = d.getUTCDay();
    const monday = new Date(d.getTime() - ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86400000));
    const weekKey = monday.toISOString().split('T')[0];
    const prev = weekMap.get(weekKey) ?? { gmv: 0, units: 0 };
    weekMap.set(weekKey, {
      gmv: prev.gmv + Number(row.gmv ?? 0),
      units: prev.units + Number(row.units_sold ?? 0),
    });
  }
  const trend_weekly = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([dateStr, v]) => {
      const d = new Date(dateStr + 'T00:00:00Z');
      const label = d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit', timeZone: 'UTC' });
      return { week_label: label, gmv: v.gmv, units: v.units };
    });

  // Products and SKU health
  type RawProduct = {
    id: string;
    name: string;
    sku_code: string | null;
    tenant_brand_id: string | null;
    is_active: boolean;
    tenant_brands: { name: string } | null;
    tenant_inventory: Array<{ qty_available: number; reorder_point: number | null }> | null;
  };
  const rawProducts = (productsRes.data ?? []) as RawProduct[];

  // Build units/gmv MTD per product
  const units30dByProduct = new Map<string, number>();
  const gmvMtdByProduct = new Map<string, number>();
  const rawUnits = (unitsRes.data ?? []) as Array<{ tenant_product_id: string; units_sold: number; gmv: number }>;
  for (const row of rawUnits) {
    units30dByProduct.set(row.tenant_product_id, (units30dByProduct.get(row.tenant_product_id) ?? 0) + Number(row.units_sold ?? 0));
    gmvMtdByProduct.set(row.tenant_product_id, (gmvMtdByProduct.get(row.tenant_product_id) ?? 0) + Number(row.gmv ?? 0));
  }

  let active_sku_count = 0;
  let oos_sku_count = 0;
  let low_stock_sku_count = 0;
  let uncovered_sku_count = 0;

  // Brand grouping for brands tab
  const brandMap = new Map<string, { name: string; initials: string; sku_count: number; gmv_mtd: number; units_mtd: number }>();

  const products = rawProducts.map((p) => {
    const inv = p.tenant_inventory?.[0];
    const qty = inv ? Number(inv.qty_available ?? 0) : 0;
    const rp = inv?.reorder_point != null ? Number(inv.reorder_point) : null;
    const units30d = units30dByProduct.get(p.id) ?? 0;
    const days_cover = units30d > 0 ? Math.round((qty * 30) / units30d) : qty > 0 ? null : null;
    const gmv_prod = gmvMtdByProduct.get(p.id) ?? 0;

    active_sku_count++;
    if (qty <= 0) oos_sku_count++;
    else if (rp != null && qty <= rp) low_stock_sku_count++;
    if (units30d === 0 && qty > 0) uncovered_sku_count++;

    const brandId = p.tenant_brand_id ?? 'unknown';
    const brandName = p.tenant_brands?.name ?? 'Unknown Brand';
    if (!brandMap.has(brandId)) {
      brandMap.set(brandId, { name: brandName, initials: getInitials(brandName), sku_count: 0, gmv_mtd: 0, units_mtd: 0 });
    }
    const brand = brandMap.get(brandId)!;
    brand.sku_count++;
    brand.gmv_mtd += gmv_prod;
    brand.units_mtd += units30d;

    return {
      id: p.id,
      name: p.name,
      sku_code: p.sku_code ?? null,
      brand_id: brandId,
      brand_name: brandName,
      on_hand: qty,
      days_cover,
      units_mtd: units30d,
      gmv_mtd: gmv_prod,
      is_active: p.is_active,
    };
  });

  const brands = Array.from(brandMap.entries()).map(([bid, b]) => ({
    id: bid,
    name: b.name,
    initials: b.initials,
    sku_count: b.sku_count,
    gmv_mtd: b.gmv_mtd,
    growth_pct: 0, // growth per brand not computed here for simplicity
    is_active: true,
  })).sort((a, b) => b.gmv_mtd - a.gmv_mtd);

  const top_brands = brands.slice(0, 5).map((b) => ({
    id: b.id,
    name: b.name,
    initials: b.initials,
    units_mtd: brandMap.get(b.id)?.units_mtd ?? 0,
    gmv_mtd: b.gmv_mtd,
  }));

  type RawActivity = {
    id: string;
    action: string;
    actor_user_id: string;
    ts: string;
    diff: unknown;
    tenant_users: { display_name: string } | null;
  };
  const activity = ((activityRes.data ?? []) as RawActivity[]).map((a) => ({
    id: a.id,
    action: a.action,
    actor_name: a.tenant_users?.display_name ?? a.actor_user_id,
    ts: a.ts,
    diff: a.diff,
  }));

  const payload: CategoryDetailResponse = {
    header: {
      id: category.id,
      tenant_id: category.tenant_id,
      name: category.name,
      slug: category.slug,
      initials: getInitials(category.name),
      description: category.description ?? null,
      is_active: category.is_active,
      display_order: category.display_order ?? 0,
      external_ref: category.external_ref ?? null,
      r2_image_thumb_key: category.r2_image_thumb_key ?? null,
      r2_image_original_key: category.r2_image_original_key ?? null,
      r2_image_medium_key: category.r2_image_medium_key ?? null,
      deleted_at: category.deleted_at ?? null,
      active_sku_count,
      brand_count: brandMap.size,
      created_at: category.created_at,
      updated_at: category.updated_at,
    },
    meta_strip_4: {
      gmv_mtd,
      growth_pct,
      active_sku_count,
      oos_sku_count,
      low_stock_sku_count,
      active_buyer_count,
    },
    overview: {
      trend_weekly,
      stock_health: { active_sku_count, oos_sku_count, low_stock_sku_count, uncovered_sku_count },
      top_brands,
    },
    products,
    brands,
    activity,
  };

  return NextResponse.json({ data: payload, error: null }, { headers: SELLER_CACHE_PERSONAL });
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
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
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
    const db = supabaseAdmin as any;
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
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    const db = supabaseAdmin as any;
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
