import type { SupabaseClient } from '@supabase/supabase-js';
import { TENANT_PRODUCT_PUBLIC_SELECT, guestUnitPrice, loadAssignedPriceListPrices, type CatalogPricingMode } from '@/lib/server/public-catalog';
import { r2Url } from '@/lib/r2-url';
import type { BuyerBrand, BuyerCatalogItem, BuyerCategory } from '@/types/buyer';
import type { ImportAnomaly } from '@/lib/onboarding/types';

const PREVIEW_LIMIT = 48;

export async function loadOnboardingProductCount(
  db: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { data } = await db
    .schema('app')
    .from('metrics_tenant_now_summary')
    .select('active_product_count')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && data.active_product_count != null) {
    return Number(data.active_product_count);
  }
  const { count } = await db
    .schema('app')
    .from('tenant_products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null);
  return count ?? 0;
}

export async function loadOnboardingCatalogSummary(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ productCount: number; slug: string; businessName: string }> {
  const [{ data: tenant }, productCount] = await Promise.all([
    db.schema('app').from('tenants').select('slug, business_name').eq('id', tenantId).maybeSingle(),
    loadOnboardingProductCount(db, tenantId),
  ]);
  return {
    productCount,
    slug: (tenant?.slug as string | undefined) ?? '',
    businessName: (tenant?.business_name as string | undefined) ?? '',
  };
}

type ProductRow = {
  id: string;
  internal_sku: string | null;
  name_override: string | null;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  gst_rate: number | null;
  hsn_code?: string | null;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[] | null;
  r2_small_key: string | null;
  r2_medium_key: string | null;
  r2_large_key: string | null;
};

export interface OnboardingPreviewPayload {
  productCount: number;
  items: BuyerCatalogItem[];
  brands: BuyerBrand[];
  categories: BuyerCategory[];
  anomalies: ImportAnomaly[];
  slug: string;
  businessName: string;
  live: boolean;
  pricingMode: CatalogPricingMode | null;
  priceListId: string | null;
  priceLists: Array<{ id: string; name: string }>;
  photoTargets: Array<{
    key: string;
    entityId: string;
    entityType: 'tenant_product' | 'tenant_brand' | 'tenant_category';
    label: string;
  }>;
}

export async function loadOnboardingPreview(
  db: SupabaseClient,
  tenantId: string,
  pricingMode: CatalogPricingMode | null,
  priceListId: string | null,
): Promise<OnboardingPreviewPayload> {
  const [{ data: tenant }, { data: catalog }, { count }, { data: priceListRows }] = await Promise.all([
    db.schema('app').from('tenants').select('slug, business_name').eq('id', tenantId).maybeSingle(),
    db.schema('app').from('catalogs').select('live_at, pricing_mode, price_list_id').eq('tenant_id', tenantId).eq('kind', 'public').is('deleted_at', null).maybeSingle(),
    db.schema('app').from('tenant_products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true).is('deleted_at', null),
    db.schema('app').from('price_lists').select('id, name').eq('tenant_id', tenantId).is('deleted_at', null).limit(200),
  ]);

  const { data: products, error: productError } = await db
    .schema('app')
    .from('tenant_products')
    .select(`${TENANT_PRODUCT_PUBLIC_SELECT}, hsn_code`)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(PREVIEW_LIMIT);

  if (productError) throw new Error(productError.message);

  const rows = (products ?? []) as ProductRow[];
  const brandIds = [...new Set(rows.map((r) => r.tenant_brand_id).filter((id): id is string => Boolean(id)))];
  const categoryIds = [...new Set(rows.map((r) => r.tenant_category_id).filter((id): id is string => Boolean(id)))];

  const [{ data: brandRows }, { data: categoryRows }] = await Promise.all([
    brandIds.length
      ? db.schema('app').from('tenant_brands').select('id, display_name_override, slug, logo_url, r2_logo_medium_key').in('id', brandIds)
      : Promise.resolve({ data: [] as unknown[] }),
    categoryIds.length
      ? db.schema('app').from('tenant_categories').select('id, name, slug, r2_image_medium_key').in('id', categoryIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const brandMap = new Map(
    ((brandRows ?? []) as Array<{ id: string; display_name_override: string | null; slug: string | null; logo_url: string | null; r2_logo_medium_key?: string | null }>).map((b) => [
      b.id,
      {
        name: b.display_name_override || b.slug || 'Brand',
        logo: r2Url(b.r2_logo_medium_key) ?? b.logo_url,
        slug: b.slug,
      },
    ]),
  );
  const categoryMap = new Map(
    ((categoryRows ?? []) as Array<{ id: string; name: string; slug: string; r2_image_medium_key?: string | null }>).map((c) => [
      c.id,
      { name: c.name, slug: c.slug, image: r2Url(c.r2_image_medium_key) },
    ]),
  );

  let assigned = new Map<string, number>();
  const effectiveMode = pricingMode;
  if (effectiveMode === 'assigned_price_list' && priceListId) {
    assigned = await loadAssignedPriceListPrices(db, {
      tenantId,
      priceListId,
      productIds: rows.map((r) => r.id),
    });
  }

  const items: BuyerCatalogItem[] = rows.map((row) => {
    const brand = row.tenant_brand_id ? brandMap.get(row.tenant_brand_id) : undefined;
    const category = row.tenant_category_id ? categoryMap.get(row.tenant_category_id) : undefined;
    const baseSelling = row.base_selling_price != null ? Number(row.base_selling_price) : null;
    const price = effectiveMode
      ? guestUnitPrice({
          mode: effectiveMode,
          assignedPrice: assigned.get(row.id),
          baseSellingPrice: baseSelling,
        })
      : baseSelling;

    return {
      id: row.id,
      tenant_product_id: row.id,
      campaign_id: null,
      campaign_name: null,
      campaign_valid_until: null,
      internal_sku: row.internal_sku ?? '',
      display_name: row.name_override || row.internal_sku || 'Product',
      brand_id: row.tenant_brand_id,
      brand_name: brand?.name ?? null,
      category_id: row.tenant_category_id,
      category_name: category?.name ?? null,
      mrp: Number(row.mrp ?? 0),
      price,
      resolved_price: baseSelling,
      gst_rate: row.gst_rate == null ? null : Number(row.gst_rate),
      default_uom: row.default_uom,
      pack_size: row.pack_size == null ? null : Number(row.pack_size),
      image_urls: row.image_urls ?? [],
      image_url_small: r2Url(row.r2_small_key),
      image_url_medium: r2Url(row.r2_medium_key),
      image_url_large: r2Url(row.r2_large_key),
      brand_logo_url: brand?.logo ?? null,
      category_image_url: category?.image ?? null,
      stock_status: 'available',
      on_hand: 0,
    };
  });

  const { data: anomalySource } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, internal_sku, name_override, gst_rate, base_selling_price, hsn_code')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(500);

  const anomalies: ImportAnomaly[] = [];
  for (const row of (anomalySource ?? []) as Array<{
    id: string;
    internal_sku: string;
    name_override: string | null;
    gst_rate: number | null;
    base_selling_price: number | null;
    hsn_code: string | null;
  }>) {
    const productName = row.name_override || row.internal_sku || 'Product';
    if (!row.internal_sku?.trim()) {
      anomalies.push({ sku: row.internal_sku ?? '', productName, kind: 'missing_sku', message: 'SKU missing', productId: row.id });
    }
    if (row.gst_rate == null) {
      anomalies.push({ sku: row.internal_sku ?? '', productName, kind: 'missing_gst', message: 'GST rate missing', productId: row.id });
    }
    if (row.base_selling_price == null || Number(row.base_selling_price) <= 0) {
      anomalies.push({ sku: row.internal_sku ?? '', productName, kind: 'zero_price', message: 'Base selling rate missing', productId: row.id });
    }
  }

  const brands: BuyerBrand[] = [...brandMap.entries()].map(([id, b]) => ({
    id,
    name: b.name,
    logo_url: b.logo,
  }));
  const categories: BuyerCategory[] = [...categoryMap.entries()].map(([id, c]) => ({
    id,
    name: c.name,
    slug: c.slug,
    product_count: rows.filter((r) => r.tenant_category_id === id).length,
    image_url: c.image,
  }));

  const photoTargets: OnboardingPreviewPayload['photoTargets'] = [
    ...rows.map((r) => ({
      key: r.internal_sku ?? r.id,
      entityId: r.id,
      entityType: 'tenant_product' as const,
      label: r.name_override || r.internal_sku || r.id,
    })),
    ...((brandRows ?? []) as Array<{ id: string; display_name_override: string | null; slug: string | null }>).map((b) => ({
      key: b.display_name_override || b.slug || b.id,
      entityId: b.id,
      entityType: 'tenant_brand' as const,
      label: b.display_name_override || b.slug || b.id,
    })),
    ...((categoryRows ?? []) as Array<{ id: string; name: string; slug: string }>).map((c) => ({
      key: c.name || c.slug,
      entityId: c.id,
      entityType: 'tenant_category' as const,
      label: c.name,
    })),
  ];

  return {
    productCount: count ?? rows.length,
    items,
    brands,
    categories,
    anomalies,
    slug: (tenant?.slug as string | undefined) ?? '',
    businessName: (tenant?.business_name as string | undefined) ?? '',
    live: Boolean((catalog as { live_at?: string | null } | null)?.live_at),
    pricingMode: ((catalog as { pricing_mode?: CatalogPricingMode | null } | null)?.pricing_mode) ?? null,
    priceListId: ((catalog as { price_list_id?: string | null } | null)?.price_list_id) ?? null,
    priceLists: ((priceListRows ?? []) as Array<{ id: string; name: string }>).map((pl) => ({ id: pl.id, name: pl.name })),
    photoTargets,
  };
}
