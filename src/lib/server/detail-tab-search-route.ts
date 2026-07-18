import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

export interface DetailSearchContext {
  db: any;
  tenantId: string;
  role: string;
  query: string | null;
  limit: number;
  offset: number;
}

export async function getDetailSearchContext(request: NextRequest): Promise<DetailSearchContext | NextResponse> {
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const query = request.nextUrl.searchParams.get('q')?.trim() || null;
  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), 50);
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get('offset')) || 0);
  return { db: supabaseAdmin as any, tenantId: claims.tenant_id, role: claims.role, query, limit, offset };
}

export function detailSearchResponse(rows: Array<Record<string, unknown>>, limit: number, offset: number) {
  const total = Number(rows[0]?.total_count ?? 0);
  return NextResponse.json(
    { rows, total, nextOffset: offset + rows.length < total ? offset + rows.length : null },
    { headers: SELLER_CACHE_PERSONAL },
  );
}
