import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

interface EstimateRow {
  id: string;
  estimate_number: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id || !claims.buyer_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin;
    const buyerId = claims.buyer_id;
    const tenantId = claims.tenant_id;

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);

    const estimatesRes = await db
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, status, total_amount, created_at, notes')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (estimatesRes.error) {
      // estimates table may not exist yet — return empty gracefully
      console.warn('[GET /api/buyer/estimates] query error (may be expected):', estimatesRes.error.message);
      return NextResponse.json({ estimates: [] });
    }

    const rows = (estimatesRes.data ?? []) as EstimateRow[];

    const estimates = rows.map((e) => ({
      id: e.id,
      estimate_number: e.estimate_number,
      status: e.status,
      total_amount: Number(e.total_amount ?? 0),
      created_at: e.created_at,
      notes: e.notes ?? null,
    }));

    return NextResponse.json({ estimates });
  } catch (err) {
    console.error('[GET /api/buyer/estimates] unexpected error:', err);
    // Graceful empty response so the UI doesn't crash
    return NextResponse.json({ estimates: [] });
  }
}
