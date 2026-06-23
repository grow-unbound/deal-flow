import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVisibleBuyerCatalogs, requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import type { BuyerBrandsResponse } from '@/types/buyer';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const context = profile.context;
    const shareToken = req.nextUrl.searchParams.get('share_token')?.trim() ?? '';
    const selectedCatalogId = req.nextUrl.searchParams.get('catalog_id')?.trim() ?? '';

    let catalogIds: string[] = [];

    if (shareToken) {
      const { data: catalog, error } = await supabaseAdmin
        .schema('app')
        .from('published_catalogs')
        .select('id')
        .eq('share_token', shareToken)
        .eq('status', 'published')
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        console.error('[GET /api/buyer/brands] share catalog error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
      }

      catalogIds = catalog?.id ? [catalog.id] : [];
    } else if (selectedCatalogId) {
      catalogIds = [selectedCatalogId];
    } else if (!profile.buyer) {
      const { data: catalogs, error } = await supabaseAdmin
        .schema('app')
        .from('published_catalogs')
        .select('id')
        .eq('tenant_id', context.tenant_id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`);

      if (error) {
        console.error('[GET /api/buyer/brands] preview catalog error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
      }

      catalogIds = ((catalogs ?? []) as Array<{ id: string }>).map((c) => c.id);
    } else if (profile.buyer) {
      const catalogs = await getVisibleBuyerCatalogs(context.tenant_id!, profile.buyer.id!);
      catalogIds = selectedCatalogId
        ? catalogs.filter((c) => c.id === selectedCatalogId).map((c) => c.id)
        : catalogs.slice(0, 1).map((c) => c.id);
    } else {
      catalogIds = [];
    }

    if (catalogIds.length === 0) {
      const body: BuyerBrandsResponse = { brands: [] };
      return NextResponse.json(body);
    }

    const { data: catalogItems, error: itemsError } = await supabaseAdmin
      .schema('app')
      .from('published_catalog_items')
      .select('tenant_product_id')
      .in('catalog_id', catalogIds)
      .is('deleted_at', null);

    if (itemsError) {
      console.error('[GET /api/buyer/brands] items error:', itemsError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const productIds = ((catalogItems ?? []) as Array<{ tenant_product_id: string }>).map((i) => i.tenant_product_id);

    if (productIds.length === 0) {
      const body: BuyerBrandsResponse = { brands: [] };
      return NextResponse.json(body);
    }

    const { data: tenantProducts, error: tenantProductsError } = await supabaseAdmin
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id')
      .in('id', productIds)
      .is('deleted_at', null)
      .eq('is_active', true);

    if (tenantProductsError) {
      console.error('[GET /api/buyer/brands] tenant products error:', tenantProductsError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const rows = (tenantProducts ?? []) as Array<{ id: string; tenant_brand_id: string | null }>;
    const countByTenantBrand = new Map<string, number>();
    for (const row of rows) {
      if (!row.tenant_brand_id) continue;
      countByTenantBrand.set(row.tenant_brand_id, (countByTenantBrand.get(row.tenant_brand_id) ?? 0) + 1);
    }

    const tenantBrandIds = Array.from(countByTenantBrand.keys());
    if (tenantBrandIds.length === 0) {
      const body: BuyerBrandsResponse = { brands: [] };
      return NextResponse.json(body);
    }

    const { data: tenantBrands, error: tbError } = await supabaseAdmin
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, master_brand_id')
      .in('id', tenantBrandIds)
      .is('deleted_at', null);

    if (tbError) {
      console.error('[GET /api/buyer/brands] tenant brands error:', tbError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const tbRows = (tenantBrands ?? []) as Array<{
      id: string;
      display_name_override: string | null;
      master_brand_id: string;
    }>;

    const masterBrandIds = Array.from(new Set(tbRows.map((b) => b.master_brand_id)));
    let masterNameById = new Map<string, string>();
    let masterLogoById = new Map<string, string | null>();
    if (masterBrandIds.length > 0) {
      const { data: masterBrands } = await supabaseAdmin
        .schema('catalog')
        .from('brands')
        .select('id, name, logo_url')
        .in('id', masterBrandIds)
        .is('deleted_at', null);

      for (const b of (masterBrands ?? []) as Array<{ id: string; name: string; logo_url: string | null }>) {
        masterNameById.set(b.id, b.name);
        masterLogoById.set(b.id, b.logo_url);
      }
    }

    const countByMaster = new Map<string, number>();
    const nameByMaster = new Map<string, string>();
    for (const b of tbRows) {
      const n = countByTenantBrand.get(b.id) ?? 0;
      countByMaster.set(b.master_brand_id, (countByMaster.get(b.master_brand_id) ?? 0) + n);
      const nm = b.display_name_override ?? masterNameById.get(b.master_brand_id) ?? 'Brand';
      if (!nameByMaster.has(b.master_brand_id)) {
        nameByMaster.set(b.master_brand_id, nm);
      }
    }

    const brands = Array.from(countByMaster.entries())
      .map(([id, product_count]) => ({
        id,
        name: nameByMaster.get(id) ?? 'Brand',
        product_count,
        logo_url: masterLogoById.get(id) ?? null,
      }))
      .sort((a, b) => b.product_count - a.product_count);

    const body: BuyerBrandsResponse = { brands };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[GET /api/buyer/brands] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
