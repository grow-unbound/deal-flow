import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';

export async function GET(req: NextRequest) {
  try {
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

    const q = req.nextUrl.searchParams.get('q') ?? '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data, error } = await db.schema('catalog').rpc('search_available_products_for_tenant', {
      p_tenant_id: claims.tenant_id,
      p_query: q.trim() || null,
      p_limit: 20,
    });

    if (error) {
      return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }

    const products = (data ?? []).map(
      (row: {
        id: string;
        name: string;
        master_sku: string;
        brand_id: string;
        gst_rate: number | null;
        hsn_code: string | null;
        default_uom: string | null;
        pack_size: number | null;
        description: string | null;
        image_urls: string[] | null;
        brand_name: string | null;
        brand_slug: string | null;
        brand_logo_url: string | null;
        category_name: string | null;
      }) => ({
        id: row.id,
        name: row.name,
        master_sku: row.master_sku,
        brand_id: row.brand_id,
        brand_name: row.brand_name,
        brand_logo_url: row.brand_logo_url,
        gst_rate: row.gst_rate,
        hsn_code: row.hsn_code,
        default_uom: row.default_uom,
        pack_size: row.pack_size,
        description: row.description,
        image_urls: row.image_urls,
        category_name: row.category_name,
      })
    );

    return NextResponse.json({ products }, { headers: SELLER_CACHE_REFERENCE });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
