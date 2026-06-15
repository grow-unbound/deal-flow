import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

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

function monthKey(dateIso: string): string {
  const d = new Date(dateIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(
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

    const db = supabaseAdmin as any;

    const { data: globalProduct, error: globalProductError } = await db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (globalProductError) {
      return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
    }

    if (!globalProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (globalProduct.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: product, error } = await db
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
        category_name,
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
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const [{ data: masterProduct }, { data: tenantBrand }, { data: inventoryRows }] = await Promise.all([
      product.master_product_id
        ? db
            .schema('catalog')
            .from('products')
            .select('id, name, master_sku, hsn_code, gst_rate, pack_size, categories(name), brands(name)')
            .eq('id', product.master_product_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      product.tenant_brand_id
        ? db
            .schema('app')
            .from('tenant_brands')
            .select('id, display_name_override, master_brand_id')
            .eq('id', product.tenant_brand_id)
            .eq('tenant_id', claims.tenant_id)
            .is('deleted_at', null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .schema('app')
        .from('tenant_inventory')
        .select('id, qty_available, updated_at')
        .eq('tenant_product_id', id)
        .is('deleted_at', null),
    ]);

    let brandName: string | null = null;
    if (tenantBrand?.display_name_override) {
      brandName = tenantBrand.display_name_override;
    } else if (tenantBrand?.master_brand_id) {
      const { data: masterBrand } = await db
        .schema('catalog')
        .from('brands')
        .select('name')
        .eq('id', tenantBrand.master_brand_id)
        .maybeSingle();
      brandName = masterBrand?.name ?? null;
    } else {
      brandName = masterProduct?.brands?.name ?? null;
    }

    const now = new Date();
    const { startIso, nextIso, prevStartIso, prevEndIso } = monthBounds(now);
    const daysInMonth = Math.max(1, now.getUTCDate());

    const lookbackStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)).toISOString();
    const [{ data: orders }, { data: auditRows }, { data: priceLists }, { data: priceListItems }, { data: assignments }, { data: cohorts }, { data: buyers }] = await Promise.all([
      db
        .schema('app')
        .from('orders')
        .select('id, status, placed_at, buyer_id')
        .eq('tenant_id', claims.tenant_id)
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .gte('placed_at', lookbackStart),
      db
        .schema('app')
        .from('audit_log')
        .select('id, ts, action, entity_type, entity_id, diff')
        .eq('tenant_id', claims.tenant_id)
        .order('ts', { ascending: false })
        .limit(200),
      db
        .schema('app')
        .from('price_lists')
        .select('id, name, valid_from, valid_to, is_active')
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('price_list_items')
        .select('id, price_list_id, tenant_product_id, price')
        .eq('tenant_product_id', id)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('price_list_assignments')
        .select('id, price_list_id, target_type, target_id')
        .is('deleted_at', null),
      db
        .schema('app')
        .from('cohorts')
        .select('id, name')
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography')
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null),
    ]);

    const orderIds = (orders ?? []).map((row: { id: string }) => row.id);

    const { data: orderItems } = orderIds.length
      ? await db
          .schema('app')
          .from('order_items')
          .select('order_id, tenant_product_id, qty, line_total, unit_price')
          .in('order_id', orderIds)
          .eq('tenant_product_id', id)
          .is('deleted_at', null)
      : { data: [] };

    const orderById = new Map<string, { id: string; placed_at: string | null; buyer_id: string | null }>(
      ((orders ?? []) as Array<{ id: string; placed_at: string | null; buyer_id: string | null }>).map((row) => [row.id, row]),
    );
    const buyerById = new Map<string, { business_name: string; geography: { city?: string; state?: string } | null }>(
      ((buyers ?? []) as Array<{ id: string; business_name: string; geography: { city?: string; state?: string } | null }>).map((row) => [
        row.id,
        { business_name: row.business_name, geography: row.geography },
      ]),
    );

    let unitsMtd = 0;
    let unitsPrev = 0;
    let unitsLast30 = 0;
    let revenueLast30 = 0;
    let lastOrderAt: string | null = null;
    let lastOrderBuyer: string | null = null;
    const monthlyUnitsMap = new Map<string, { units: number; revenue: number }>();
    const buyerUnitsMap = new Map<string, number>();

    for (const item of (orderItems ?? []) as Array<{
      order_id: string;
      qty: number | null;
      line_total: number | null;
      unit_price: number | null;
    }>) {
      const order = orderById.get(item.order_id);
      if (!order?.placed_at) continue;
      const placedAt = order.placed_at;
      const qty = Number(item.qty ?? 0);
      const lineTotal = Number(item.line_total ?? qty * Number(item.unit_price ?? 0));

      if (placedAt >= startIso && placedAt < nextIso) unitsMtd += qty;
      if (placedAt >= prevStartIso && placedAt < prevEndIso) unitsPrev += qty;

      const placedTs = new Date(placedAt).getTime();
      if (!lastOrderAt || placedTs > new Date(lastOrderAt).getTime()) {
        lastOrderAt = placedAt;
        lastOrderBuyer = order.buyer_id ? (buyerById.get(order.buyer_id)?.business_name ?? null) : null;
      }
      if (placedTs >= now.getTime() - 30 * 24 * 60 * 60 * 1000) {
        unitsLast30 += qty;
        revenueLast30 += lineTotal;
      }

      const orderMonth = monthKey(placedAt);
      const currentMonth = monthlyUnitsMap.get(orderMonth) ?? { units: 0, revenue: 0 };
      currentMonth.units += qty;
      currentMonth.revenue += lineTotal;
      monthlyUnitsMap.set(orderMonth, currentMonth);
      if (order.buyer_id) {
        buyerUnitsMap.set(order.buyer_id, (buyerUnitsMap.get(order.buyer_id) ?? 0) + qty);
      }
    }

    const growthPct = unitsPrev > 0 ? ((unitsMtd - unitsPrev) / unitsPrev) * 100 : unitsMtd > 0 ? 100 : 0;
    const onHand = (inventoryRows ?? []).reduce((sum: number, row: any) => sum + Number(row.qty_available ?? 0), 0);
    const avgDaily = unitsMtd / daysInMonth;
    const daysCover = onHand === 0 ? 0 : avgDaily <= 0 ? 999 : Math.max(0, Math.round(onHand / avgDaily));
    const sellThrough = onHand + unitsLast30 > 0 ? Math.round((unitsLast30 / (onHand + unitsLast30)) * 100) : 0;

    const monthSeries = Array.from({ length: 12 }).map((_, i) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const month = monthlyUnitsMap.get(key) ?? { units: 0, revenue: 0 };
      return {
        month: key,
        units: month.units,
        revenue: month.revenue,
      };
    });

    const topBuyers = Array.from(buyerUnitsMap.entries())
      .map(([buyerId, units]) => {
        const buyer = buyerById.get(buyerId);
        return {
          buyer_id: buyerId,
          buyer_name: buyer?.business_name ?? 'Unknown buyer',
          city: buyer?.geography?.city ?? buyer?.geography?.state ?? null,
          units,
        };
      })
      .sort((a, b) => b.units - a.units)
      .slice(0, 4);

    const cohortById = new Map((cohorts ?? []).map((row: any) => [row.id, row.name]));
    const assignmentsByList = new Map<string, Array<{ id: string; target_type: string; target_id: string | null }>>();
    for (const assignment of assignments ?? []) {
      const bucket = assignmentsByList.get(assignment.price_list_id) ?? [];
      bucket.push(assignment);
      assignmentsByList.set(assignment.price_list_id, bucket);
    }

    const pricingRows = (priceListItems ?? [])
      .map((item: any) => {
        const pl = (priceLists ?? []).find((row: any) => row.id === item.price_list_id);
        if (!pl) return null;
        const listAssignments = assignmentsByList.get(pl.id) ?? [];
        const targets =
          listAssignments.length === 0
            ? ['All buyers']
            : listAssignments.map((a) => {
                if (a.target_type === 'cohort') return cohortById.get(a.target_id ?? '') ?? 'Cohort';
                if (a.target_type === 'buyer') return 'Buyer-specific';
                return 'All buyers';
              });
        return {
          item_id: item.id,
          price_list_id: pl.id,
          price_list_name: pl.name,
          effective_price: Number(item.price ?? 0),
          cohorts: Array.from(new Set(targets)),
          valid_from: pl.valid_from,
          valid_to: pl.valid_to,
          is_active: Boolean(pl.is_active),
          has_override: Number(item.price ?? 0) !== Number(product.base_selling_price ?? 0),
          base_price: Number(product.base_selling_price ?? 0),
        };
      })
      .filter(Boolean);

    const cohortPriceMap = new Map<string, { price: number; has_override: boolean }>();
    for (const priceRow of pricingRows as Array<{ cohorts: string[]; effective_price: number; has_override: boolean }>) {
      for (const cohortName of priceRow.cohorts) {
        if (!cohortPriceMap.has(cohortName)) {
          cohortPriceMap.set(cohortName, {
            price: priceRow.effective_price,
            has_override: priceRow.has_override,
          });
        }
      }
    }
    if (!cohortPriceMap.has('All buyers (base)')) {
      cohortPriceMap.set('All buyers (base)', {
        price: Number(product.base_selling_price ?? 0),
        has_override: false,
      });
    }

    const priceListItemIds = new Set((priceListItems ?? []).map((row: any) => row.id));
    const priceListIds = new Set((priceListItems ?? []).map((row: any) => row.price_list_id));
    const inventoryEntityIds = new Set([id, ...(inventoryRows ?? []).map((row: any) => row.id).filter(Boolean)]);
    const orderIdSet = new Set(orderIds);
    const activity = (auditRows ?? [])
      .filter((row: any) => {
        if (row.entity_type === 'tenant_product') return row.entity_id === id;
        if (row.entity_type === 'tenant_inventory') return inventoryEntityIds.has(row.entity_id);
        if (row.entity_type === 'order') return orderIdSet.has(row.entity_id);
        if (row.entity_type === 'price_list_item') return priceListItemIds.has(row.entity_id);
        if (row.entity_type === 'price_list') return priceListIds.has(row.entity_id);
        return false;
      })
      .slice(0, 60)
      .map((row: any) => ({
        id: row.id,
        at: row.ts,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        summary: `${row.action} ${row.entity_type}`,
        diff: row.diff,
      }));

    const displayName = product.name_override ?? masterProduct?.name ?? product.internal_sku;
    const statusTone = !product.is_active ? 'neutral' : onHand === 0 ? 'danger' : daysCover < 14 ? 'warning' : 'success';
    const statusLabel = !product.is_active ? 'Inactive' : onHand === 0 ? 'Out of stock' : daysCover < 14 ? 'Low stock' : 'On pace';

    const detailResponse = {
      header: {
        id: product.id,
        name: displayName,
        brand: brandName ?? 'Unbranded',
        sku: product.internal_sku,
        pack: product.pack_size ? `${product.pack_size} ${product.default_uom ?? ''}`.trim() : product.default_uom ?? '—',
        mrp: Number(product.mrp ?? 0),
        status_label: statusLabel,
        status_tone: statusTone,
      },
      meta_strip_4: {
        units_mtd: unitsMtd,
        growth_pct: Number(growthPct.toFixed(1)),
        days_cover: daysCover,
        on_hand: onHand,
        sell_through_pct: sellThrough,
      },
      details: {
        id: product.id,
        name: displayName,
        sku: product.internal_sku,
        category: product.category_name ?? masterProduct?.categories?.name ?? 'Uncategorized',
        pack_size: product.pack_size ?? masterProduct?.pack_size ?? null,
        default_uom: product.default_uom,
        mrp: product.mrp,
        name_override: product.name_override,
        base_selling_price: product.base_selling_price,
        cost_price: claims.role === 'seller_admin' ? product.cost_price : null,
        external_ref: product.external_ref,
        is_active: product.is_active,
        hsn_code: product.hsn_code ?? masterProduct?.hsn_code ?? null,
        gst_rate: product.gst_rate ?? masterProduct?.gst_rate ?? null,
        description: product.description ?? null,
        updated_at: product.updated_at,
      },
      performance: {
        monthly_units_trend: monthSeries,
        inventory_ops: {
          on_hand: onHand,
          days_cover: daysCover,
          sell_through_pct: sellThrough,
          last_ordered_at: lastOrderAt,
          last_ordered_buyer: lastOrderBuyer,
        },
        top_buyers: topBuyers,
        price_by_cohort: Array.from(cohortPriceMap.entries()).map(([cohort, data]) => ({
          cohort,
          price: data.price,
          has_override: data.has_override,
        })),
        units_snapshot: {
          units_mtd: unitsMtd,
          growth_pct: Number(growthPct.toFixed(1)),
          revenue_last_30d: Math.round(revenueLast30),
        },
      },
      pricing_summary: {
        mrp: product.mrp,
        base_selling_price: product.base_selling_price,
        cost_price: claims.role === 'seller_admin' ? product.cost_price : null,
        margin_pct:
          product.base_selling_price && product.cost_price
            ? Number((((product.base_selling_price - product.cost_price) / product.base_selling_price) * 100).toFixed(1))
            : null,
      },
      pricing: pricingRows,
      activity,
      role: claims.role,
    };

    const responseProduct = claims.role === 'seller_assistant'
      ? (() => {
          const { cost_price: _ignored, ...rest } = product;
          void _ignored;
          return rest;
        })()
      : product;

    return NextResponse.json({ product: responseProduct, detail: detailResponse });
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

    if (updateFields.name !== undefined) {
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
