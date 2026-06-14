import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVisibleBuyerCatalogs, requireBuyerAccessProfile } from '@/lib/server/buyer-access';

interface CatalogItem {
  id: string;
  name: string;
  product_count: number;
  share_token: string;
  valid_until: string | null;
}

interface BuyerCatalogsResponse {
  catalogs: CatalogItem[];
}

interface CatalogItemCountRow {
  catalog_id: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const context = profile.context;
    const buyer = profile.buyer;
    let catalogs = context.mode === 'preview' || !buyer
      ? []
      : await getVisibleBuyerCatalogs(context.tenant_id, buyer.id);

    if (context.mode === 'preview') {
      const previewRes = await supabaseAdmin
        .schema('app')
        .from('published_catalogs')
        .select('id, name, share_token, valid_to, created_at')
        .eq('tenant_id', context.tenant_id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false });

      if (previewRes.error) {
        console.error('[GET /api/buyer/catalogs] preview catalogs query error:', previewRes.error);
        return NextResponse.json({ error: 'Failed to fetch catalogs' }, { status: 500 });
      }

      catalogs = (previewRes.data ?? []) as typeof catalogs;
    }

    const catalogIds = catalogs.map((catalog) => catalog.id);
    let itemCounts: CatalogItemCountRow[] = [];

    if (catalogIds.length > 0) {
      const itemsRes = await supabaseAdmin
        .schema('app')
        .from('published_catalog_items')
        .select('catalog_id')
        .in('catalog_id', catalogIds)
        .is('deleted_at', null);

      if (itemsRes.error) {
        console.error('[GET /api/buyer/catalogs] items query error:', itemsRes.error);
        return NextResponse.json({ error: 'Failed to fetch catalog items' }, { status: 500 });
      }

      itemCounts = (itemsRes.data ?? []) as CatalogItemCountRow[];
    }

    const countByCatalog = new Map<string, number>();
    for (const item of itemCounts) {
      countByCatalog.set(item.catalog_id, (countByCatalog.get(item.catalog_id) ?? 0) + 1);
    }

    const payload: BuyerCatalogsResponse = {
      catalogs: catalogs.map((catalog) => ({
        id: catalog.id,
        name: catalog.name,
        product_count: countByCatalog.get(catalog.id) ?? 0,
        share_token: catalog.share_token,
        valid_until: catalog.valid_to,
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[GET /api/buyer/catalogs] unexpected error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
