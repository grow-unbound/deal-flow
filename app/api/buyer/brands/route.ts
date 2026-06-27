import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import type { BuyerBrandsResponse } from '@/types/buyer';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id || !supabaseAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = profile.context.tenant_id;
    const buyerId = profile.buyer?.id ?? null;
    const allowedTenantBrandIds = buyerId
      ? await resolveBuyerAllowedTenantBrandIds(supabaseAdmin as any, tenantId, buyerId)
      : null;

    let productsQuery = supabaseAdmin
      .schema('app')
      .from('tenant_products')
      .select('tenant_brand_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (Array.isArray(allowedTenantBrandIds)) {
      if (allowedTenantBrandIds.length === 0) return NextResponse.json({ brands: [] } satisfies BuyerBrandsResponse);
      productsQuery = productsQuery.in('tenant_brand_id', allowedTenantBrandIds);
    }

    const { data: rows, error } = await productsQuery;
    if (error) throw new Error(error.message);

    const countByTenantBrand = new Map<string, number>();
    for (const row of (rows ?? []) as Array<{ tenant_brand_id: string | null }>) {
      if (!row.tenant_brand_id) continue;
      countByTenantBrand.set(row.tenant_brand_id, (countByTenantBrand.get(row.tenant_brand_id) ?? 0) + 1);
    }

    const tenantBrandIds = Array.from(countByTenantBrand.keys());
    if (tenantBrandIds.length === 0) return NextResponse.json({ brands: [] } satisfies BuyerBrandsResponse);

    const { data: tenantBrands, error: tenantBrandsError } = await supabaseAdmin
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, master_brand_id')
      .in('id', tenantBrandIds)
      .is('deleted_at', null);
    if (tenantBrandsError) throw new Error(tenantBrandsError.message);

    const masterBrandIds = Array.from(
      new Set(((tenantBrands ?? []) as Array<{ master_brand_id: string | null }>).map((brand) => brand.master_brand_id).filter(Boolean) as string[]),
    );
    const { data: masterBrands } = masterBrandIds.length > 0
      ? await supabaseAdmin.schema('catalog').from('brands').select('id, name, logo_url').in('id', masterBrandIds)
      : { data: [] };
    const masterBrandMap = new Map(((masterBrands ?? []) as Array<{ id: string; name: string; logo_url: string | null }>).map((brand) => [brand.id, brand]));

    const brands = ((tenantBrands ?? []) as Array<{ id: string; display_name_override: string | null; master_brand_id: string | null }>)
      .map((brand) => ({
        id: brand.master_brand_id ?? brand.id,
        name: brand.display_name_override ?? (brand.master_brand_id ? masterBrandMap.get(brand.master_brand_id)?.name ?? 'Brand' : 'Brand'),
        product_count: countByTenantBrand.get(brand.id) ?? 0,
        logo_url: brand.master_brand_id ? masterBrandMap.get(brand.master_brand_id)?.logo_url ?? null : null,
      }))
      .sort((a, b) => b.product_count - a.product_count);

    return NextResponse.json({ brands } satisfies BuyerBrandsResponse);
  } catch (err) {
    console.error('[GET /api/buyer/brands]', err);
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
  }
}
