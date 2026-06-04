import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';

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

    let query = db
      .schema('catalog')
      .from('products')
      .select(
        'id, name, master_sku, brand_id, gst_rate, hsn_code, default_uom, pack_size, description, image_urls, brands!inner(id, name, slug, logo_url), categories!left(name)'
      )
      .eq('is_public', true)
      .limit(20);

    if (q.trim()) {
      query = query.or(`name.ilike.%${q}%,master_sku.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }

    // Reshape: hoist brand fields from joined `brands` object
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
        brands: { id: string; name: string; slug: string; logo_url: string | null } | null;
        categories: { name: string } | null;
      }) => ({
        id: row.id,
        name: row.name,
        master_sku: row.master_sku,
        brand_id: row.brand_id,
        brand_name: row.brands?.name ?? null,
        brand_logo_url: row.brands?.logo_url ?? null,
        gst_rate: row.gst_rate,
        hsn_code: row.hsn_code,
        default_uom: row.default_uom,
        pack_size: row.pack_size,
        description: row.description,
        image_urls: row.image_urls,
        category_name: row.categories?.name ?? null,
      })
    );

    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
