import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type BuyerSnapshotRow = {
  buyer_id: string;
  is_active: boolean | null;
  is_dormant: boolean | null;
  outstanding_dues: number | null;
  overdue_amount: number | null;
  refreshed_at: string | null;
};

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];

    let query = supabaseAdmin
      .schema('app')
      .from('buyers_snapshot')
      .select('buyer_id, is_active, is_dormant, outstanding_dues, overdue_amount, refreshed_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('scope', isAssistant ? 'location' : 'tenant');

    if (isAssistant) {
      query = assistantLocationIds.length > 0 ? query.in('location_id', assistantLocationIds) : query.limit(0);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/tenant/customers/summary]', error);
      return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
    }

    const snapshotsByBuyerId = new Map<string, BuyerSnapshotRow>();
    for (const row of (data ?? []) as BuyerSnapshotRow[]) {
      const current = snapshotsByBuyerId.get(row.buyer_id);
      if (!current) {
        snapshotsByBuyerId.set(row.buyer_id, row);
        continue;
      }

      snapshotsByBuyerId.set(row.buyer_id, {
        buyer_id: row.buyer_id,
        is_active: Boolean(current.is_active) || Boolean(row.is_active),
        is_dormant: Boolean(current.is_dormant) || Boolean(row.is_dormant),
        outstanding_dues: toNumber(current.outstanding_dues) + toNumber(row.outstanding_dues),
        overdue_amount: toNumber(current.overdue_amount) + toNumber(row.overdue_amount),
        refreshed_at: current.refreshed_at && row.refreshed_at
          ? (current.refreshed_at >= row.refreshed_at ? current.refreshed_at : row.refreshed_at)
          : current.refreshed_at ?? row.refreshed_at,
      });
    }

    if (snapshotsByBuyerId.size === 0) {
      return NextResponse.json({ total: null }, { status: 404 });
    }

    const snapshots = Array.from(snapshotsByBuyerId.values());
    const payload = {
      total_count: snapshots.length,
      active_count: snapshots.filter((row) => Boolean(row.is_active) && !Boolean(row.is_dormant)).length,
      dormant_count: snapshots.filter((row) => Boolean(row.is_active) && Boolean(row.is_dormant)).length,
      due_count: snapshots.filter((row) => toNumber(row.outstanding_dues) > 0).length,
      overdue_count: snapshots.filter((row) => toNumber(row.overdue_amount) > 0).length,
      outstanding_dues: snapshots.reduce((sum, row) => sum + toNumber(row.outstanding_dues), 0),
      overdue_amount: snapshots.reduce((sum, row) => sum + toNumber(row.overdue_amount), 0),
      refreshed_at: snapshots.reduce<string | null>((latest, row) => {
        if (!row.refreshed_at) return latest;
        if (!latest) return row.refreshed_at;
        return latest >= row.refreshed_at ? latest : row.refreshed_at;
      }, null),
    };

    return NextResponse.json(payload, { headers: SELLER_CACHE_PERSONAL });
  } catch (e) {
    console.error('[GET /api/tenant/customers/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
