import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

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

interface PublishedCatalogRow {
  id: string;
  name: string;
  share_token: string;
  valid_to: string | null;
}

interface CatalogItemCountRow {
  catalog_id: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.buyer_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin;
    const tenantId = claims.tenant_id;

    const catalogsRes = await db
      .schema('app')
      .from('published_catalogs')
      .select('id, name, share_token, valid_to')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (catalogsRes.error) {
      console.error('[GET /api/buyer/catalogs] catalogs query error:', catalogsRes.error);
      return NextResponse.json({ error: 'Failed to fetch catalogs' }, { status: 500 });
    }

    const catalogs = (catalogsRes.data ?? []) as PublishedCatalogRow[];
    const catalogIds = catalogs.map((c) => c.id);

    let itemCounts: CatalogItemCountRow[] = [];
    if (catalogIds.length > 0) {
      const itemsRes = await db
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
