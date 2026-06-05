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

    const db = supabaseAdmin as any;

    // Fetch distinct non-null category_names from this tenant's products
    // Union with distinct category_names from the master catalog for completeness
    const { data, error } = await db
      .schema('app')
      .from('tenant_products')
      .select('category_name')
      .eq('tenant_id', claims.tenant_id)
      .not('category_name', 'is', null)
      .not('category_name', 'eq', '')
      .order('category_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate client-side (cheaper than a DB RPC for this simple case)
    const seen = new Set<string>();
    const categories: string[] = [];
    for (const row of data ?? []) {
      const name = (row.category_name as string).trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        categories.push(name);
      }
    }

    return NextResponse.json({ categories });
  } catch (err) {
    console.error('[GET /api/tenant/categories]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
