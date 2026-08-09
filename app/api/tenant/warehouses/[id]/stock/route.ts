import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';
import { loadWarehouseStockPage } from '@/lib/server/warehouse-data';

export const dynamic = 'force-dynamic';

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid warehouse id') });

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = IdParamsSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError(400, parsedId.error.issues[0]?.message ?? 'Invalid id', 'VALIDATION');
  }

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden', 'FORBIDDEN');
    if (!supabaseAdmin) return jsonError(500, 'Server configuration error', 'SERVER_ERROR');

    const db = supabaseAdmin as any;
    const { data: warehouse, error: warehouseError } = await db
      .schema('app')
      .from('warehouses')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (warehouseError || !warehouse) {
      return jsonError(404, 'Warehouse not found', 'NOT_FOUND');
    }

    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1') || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('page_size') ?? '50') || 50));
    const statuses = request.nextUrl.searchParams.getAll('status').filter(Boolean);
    const stockPage = await loadWarehouseStockPage(db, id, {
      page,
      pageSize,
      query: request.nextUrl.searchParams.get('q')?.trim() || null,
      statuses: statuses.length > 0 ? statuses : null,
      sort: request.nextUrl.searchParams.get('sort') || 'product_asc',
    });

    return NextResponse.json(
      { data: stockPage, error: null },
      { status: 200, headers: { 'Cache-Control': SELLER_GET_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error('[GET /api/tenant/warehouses/[id]/stock]', error);
    return jsonError(500, 'Failed to load warehouse stock', 'LOAD_FAILED');
  }
}
