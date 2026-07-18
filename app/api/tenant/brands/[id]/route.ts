import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { TenantBrandUpdateSchema } from '@/lib/zod';

type DbClient = NonNullable<typeof supabaseAdmin>;
type OrderRow = {
  id: string;
  buyer_id: string;
  status: string;
  placed_at: string | null;
  campaign_id: string | null;
};
type OrderItemRow = {
  order_id: string;
  tenant_product_id: string;
  qty: number | null;
  line_total: number | null;
  unit_price: number | null;
};
type BuyerRow = {
  id: string;
  business_name: string;
  tier: string | null;
  is_active: boolean;
  geography: { city?: string; state?: string } | null;
};
type ProductRow = {
  id: string;
  master_product_id: string | null;
  internal_sku: string;
  name_override: string | null;
};
type BrandKpiRow = {
  day: string;
  gmv: number | null;
};
type ProductKpiRow = {
  tenant_product_id: string;
  units_sold: number | null;
  on_hand: number | null;
};

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

function toNullableText(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as DbClient as any;
  const tenantId = claims.tenant_id;

  const { data: tenantBrand, error: brandError } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id, tenant_id, master_brand_id, display_name_override, slug, description, logo_url, margin_pct, exclusivity, is_active, external_ref, principal_name, principal_email, principal_phone, principal_location, contact_name, contact_email, contact_phone, default_cohort_id, created_at, updated_at, deleted_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (brandError) return NextResponse.json({ error: 'Failed to fetch brand' }, { status: 500 });
  if (!tenantBrand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  if (tenantBrand.tenant_id !== tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [detailV2Res, masterBrandRes, tenantProductsRes, catalogsItemsRes, auditRes] = await Promise.all([
    db.schema('app').rpc('get_seller_brand_detail_v2', {
      p_tenant_id: tenantId,
      p_tenant_brand_id: id,
    }),
    tenantBrand.master_brand_id
      ? db.schema('catalog').from('brands').select('id, name, slug, description, logo_url').eq('id', tenantBrand.master_brand_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .schema('app')
      .from('tenant_products')
      .select('id, master_product_id, internal_sku, name_override, base_selling_price, is_active')
      .eq('tenant_id', tenantId)
      .eq('tenant_brand_id', id)
      .is('deleted_at', null)
      .limit(200),
    db
      .schema('app')
      .from('campaign_items')
      .select('campaign_id, tenant_product_id, updated_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .limit(50),
    db
      .schema('app')
      .from('audit_log')
      .select('id, entity_type, entity_id, action, ts, diff')
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'tenant_brand')
      .eq('entity_id', id)
      .order('ts', { ascending: false })
      .limit(20),
  ]);

  if (detailV2Res.error) {
    console.error('[GET /api/tenant/brands/[id]] get_seller_brand_detail_v2 failed', detailV2Res.error);
    return NextResponse.json({ error: 'Failed to fetch brand detail' }, { status: 500 });
  }

  const detailV2 = (detailV2Res.data ?? {}) as any;
  const kpiByLabel = new Map<string, any>((detailV2.kpi_grid ?? []).map((item: any) => [String(item.label), item.value]));
  const brandName = tenantBrand.display_name_override ?? masterBrandRes.data?.name ?? 'Brand';
  const products = tenantProductsRes.data ?? [];
  const productCount = Number(kpiByLabel.get('Products') ?? products.length ?? 0);
  const invoicedSales90d = Number(kpiByLabel.get('Invoiced sales 90D') ?? 0);
  const units90d = Number(kpiByLabel.get('Units 90D') ?? 0);

  const catalogs = (catalogsItemsRes.data ?? [])
    .filter((item: any) => products.some((product: any) => product.id === item.tenant_product_id))
    .slice(0, 10)
    .map((item: any) => ({
      id: item.campaign_id,
      name: 'Campaign',
      scope_label: 'Brand product',
      status: 'active',
      updated_at: item.updated_at,
    }));
  const latestCatalogDate = catalogs.reduce((latest: string | null, item: { updated_at: string | null }) => {
    if (!item.updated_at) return latest;
    return !latest || item.updated_at > latest ? item.updated_at : latest;
  }, null as string | null);
  const daysSinceCatalog = latestCatalogDate
    ? Math.max(0, Math.floor((Date.now() - new Date(latestCatalogDate).getTime()) / 86_400_000))
    : null;

  const response = {
    header: {
      id: tenantBrand.id,
      brand_name: brandName,
      initials: brandName.split(' ').map((part: string) => part[0] ?? '').join('').slice(0, 2).toUpperCase(),
      hue: 'teal',
      status_label: tenantBrand.is_active ? 'Active' : 'Inactive',
      status_tone: tenantBrand.is_active ? 'success' : 'neutral',
      category: 'Portfolio',
      region: tenantBrand.principal_location ?? '—',
      carried_since: tenantBrand.created_at,
      skus: productCount,
      portfolio_share_pct: 0,
    },
    meta_strip_4: {
      gmv_mtd: invoicedSales90d,
      // get_seller_brand_detail_v2's kpi_grid only returns {Invoiced sales 90D, Units
      // 90D, Products} — no buyer/prior-period/stock-risk data. product_count and
      // units_90d below are real; active_buyers/total_buyers/low_stock_skus stay null
      // (rendered as "Not available" — see doc lines 759-760) rather than fake zeros.
      product_count: productCount,
      units_90d: units90d,
      active_buyers: null,
      total_buyers: null,
      low_stock_skus: null,
      days_since_catalog: daysSinceCatalog,
      last_sent_date: latestCatalogDate,
    },
    details: {
      ...tenantBrand,
      brand_name: brandName,
      name: brandName,
      master_brand: masterBrandRes.data,
      product_count: productCount,
      units_90d: units90d,
    },
    performance_cards: detailV2.performance_cards ?? [],
    detail_v2: detailV2,
    buyers_total: 0,
    buyers: [],
    catalogs,
    activity: (auditRes.data ?? []).map((row: any) => ({
      id: row.id,
      kind: row.action,
      title: row.action,
      subtitle: row.entity_type,
      at: row.ts,
      diff: row.diff,
    })),
    performance: {
      monthly_trend: [],
      top_buyers: [],
      top_skus: [],
      catalog_history: [],
    },
  };

  return NextResponse.json(response, { headers: SELLER_CACHE_PERSONAL });
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const body = await request.json().catch(() => null);
  const parsed = TenantBrandUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const db = supabaseAdmin as DbClient as any;

  const { data: existing } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id, tenant_id, slug')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  if (existing.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.display_name_override !== undefined) payload.display_name_override = toNullableText(parsed.data.display_name_override);
  if (parsed.data.slug !== undefined) payload.slug = toNullableText(parsed.data.slug);
  if (parsed.data.description !== undefined) payload.description = toNullableText(parsed.data.description);
  if (parsed.data.logo_url !== undefined) payload.logo_url = toNullableText(parsed.data.logo_url);
  if (parsed.data.margin_pct !== undefined) payload.margin_pct = parsed.data.margin_pct;
  if (parsed.data.exclusivity !== undefined) payload.exclusivity = parsed.data.exclusivity;
  if (parsed.data.external_ref !== undefined) payload.external_ref = toNullableText(parsed.data.external_ref);
  if (parsed.data.principal_name !== undefined) payload.principal_name = toNullableText(parsed.data.principal_name);
  if (parsed.data.principal_email !== undefined) payload.principal_email = toNullableText(parsed.data.principal_email);
  if (parsed.data.principal_phone !== undefined) payload.principal_phone = toNullableText(parsed.data.principal_phone);
  if (parsed.data.principal_location !== undefined) payload.principal_location = toNullableText(parsed.data.principal_location);
  if (parsed.data.contact_name !== undefined) payload.contact_name = toNullableText(parsed.data.contact_name);
  if (parsed.data.contact_email !== undefined) payload.contact_email = toNullableText(parsed.data.contact_email);
  if (parsed.data.contact_phone !== undefined) payload.contact_phone = toNullableText(parsed.data.contact_phone);
  if (parsed.data.default_cohort_id !== undefined) payload.default_cohort_id = parsed.data.default_cohort_id;
  if (parsed.data.is_active !== undefined) payload.is_active = parsed.data.is_active;
  if (parsed.data.archive) payload.deleted_at = new Date().toISOString();

  if (parsed.data.default_cohort_id) {
    const { data: cohort } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('id', parsed.data.default_cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!cohort) {
      return NextResponse.json({ error: 'Selected cohort is invalid for this tenant.' }, { status: 400 });
    }
  }

  if (payload.slug && payload.slug !== existing.slug) {
    const { data: slugMatch } = await db
      .schema('app')
      .from('tenant_brands')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('slug', payload.slug)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle();

    if (slugMatch) {
      return NextResponse.json({ error: 'A brand with this slug already exists.' }, { status: 409 });
    }
  }

  const { data: updated, error } = await db
    .schema('app')
    .from('tenant_brands')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 });

  return NextResponse.json({ brand: updated });
}
