import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
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

interface GlobalSearchRow {
  entity_type: string;
  id: string;
  label: string;
  sublabel: string;
  url_path: string;
}

const ENTITY_ORDER = [
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

export async function GET(req: NextRequest): Promise<NextResponse<GlobalSearchResponse | { error: string }>> {
  const claims = await getVerifiedClaims(req);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ groups: [], total: 0 }, { headers: SELLER_CACHE_REFERENCE });
  }

  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? '5');
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 10)
    : 5;

  const db = supabaseAdmin as any;
  if (!db) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const locationScope = getSellerLocationScope({
    role: claims.role ?? null,
    location_ids: claims.location_ids ?? null,
  });
  const scopedLocationIds = locationScope.mode === 'subset' ? locationScope.locationIds : null;

  const { data, error } = await db.schema('app').rpc('global_search', {
    p_query: q,
    p_tenant_id: claims.tenant_id,
    p_role: claims.role,
    p_items_per_group: limit,
    p_location_ids: scopedLocationIds,
  });

  if (error) {
    console.error('[search] global_search error:', error);
    return NextResponse.json({ groups: [], total: 0 }, { headers: SELLER_CACHE_REFERENCE });
  }

  const byType = new Map<string, SearchItem[]>();
  for (const row of (data ?? []) as GlobalSearchRow[]) {
    const list = byType.get(row.entity_type) ?? [];
    list.push({ id: row.id, label: row.label, sublabel: row.sublabel, url_path: row.url_path });
    byType.set(row.entity_type, list);
  }

  const groups: SearchGroup[] = ENTITY_ORDER
    .map((entity_type) => ({ entity_type, items: byType.get(entity_type) ?? [] }))
    .filter((group) => group.items.length > 0);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return NextResponse.json({ groups, total }, { headers: SELLER_CACHE_REFERENCE });
}
