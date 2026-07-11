import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { createProductQueryEmbedding } from '@/lib/server/product-search';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export interface SearchItem {
  id: string;
  label: string;
  sublabel: string;
  url_path: string;
}

export interface SearchGroup {
  entity_type: string;
  items: SearchItem[];
}

export interface GlobalSearchResponse {
  groups: SearchGroup[];
  total: number;
}

export async function GET(req: NextRequest): Promise<NextResponse<GlobalSearchResponse | { error: string }>> {
  const claims = await getVerifiedClaims(req);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json({ groups: [], total: 0 }, { headers: SELLER_CACHE_REFERENCE });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '5'), 10);
  const queryEmbedding = await createProductQueryEmbedding(q);

  const db = supabaseAdmin;
  if (!db) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .schema('app')
    .rpc('global_search', {
    p_query: q,
    p_tenant_id: claims.tenant_id,
    p_role: claims.role,
    p_items_per_group: limit,
    p_query_embedding: queryEmbedding,
  });

  if (error) {
    console.error('[search] global_search RPC error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    entity_type: string;
    id: string;
    label: string;
    sublabel: string;
    url_path: string;
  }>;

  // Group rows by entity_type preserving seller-app navigation order.
  const ORDER = [
    'product',
    'brand',
    'category',
    'customer',
    'cohort',
    'campaign',
    'price_list',
    'order',
    'invoice',
    'estimate',
    'location',
    'warehouse',
  ];
  const map = new Map<string, SearchItem[]>();
  for (const row of rows) {
    const list = map.get(row.entity_type) ?? [];
    list.push({ id: row.id, label: row.label, sublabel: row.sublabel, url_path: row.url_path });
    map.set(row.entity_type, list);
  }

  const groups: SearchGroup[] = ORDER
    .filter((t) => map.has(t))
    .map((t) => ({ entity_type: t, items: map.get(t)! }));

  const total = rows.length;
  return NextResponse.json({ groups, total }, { headers: SELLER_CACHE_REFERENCE });
}
