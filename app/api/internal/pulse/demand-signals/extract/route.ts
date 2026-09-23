import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import {
  buildPulseDemandSignalsSnapshot,
  writePulseDemandSignalsSnapshot,
} from '@/lib/server/pulse-demand-signals';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.PULSE_DEMAND_SIGNALS_EXTRACT_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({})) as { tenant_id?: string; limit?: number };
  const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);
  const tenantIds: string[] = [];

  if (typeof body.tenant_id === 'string' && body.tenant_id.trim().length > 0) {
    tenantIds.push(body.tenant_id.trim());
  } else {
    const { data, error } = await supabaseAdmin
      .schema('app')
      .from('tenants')
      .select('id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      console.error('[pulse demand extract] tenant list failed', error);
      return NextResponse.json({ error: 'Failed to list tenants' }, { status: 500 });
    }
    tenantIds.push(...((data ?? []) as Array<{ id: string }>).map((row) => row.id));
  }

  const results: Array<{ tenant_id: string; status: 'updated' | 'failed'; error?: string }> = [];
  for (const tenantId of tenantIds) {
    try {
      const snapshot = await buildPulseDemandSignalsSnapshot(supabaseAdmin as any, tenantId);
      await writePulseDemandSignalsSnapshot(supabaseAdmin as any, tenantId, snapshot);
      results.push({ tenant_id: tenantId, status: 'updated' });
    } catch (error) {
      console.error('[pulse demand extract] tenant failed', {
        tenant_id: tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        tenant_id: tenantId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }

  return NextResponse.json({
    attempted: results.length,
    updated: results.filter((result) => result.status === 'updated').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
  });
}
