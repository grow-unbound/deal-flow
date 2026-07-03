import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims, decodeJWTPayload } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import type { AccessBuyer, AccessKpis, AccessPageResponse } from '@/hooks/useBuyerAppAccess';

// ─── GET /api/tenant/buyer-app/access ───────────────────────────────────────
// Returns all active buyers + precomputed KPI counts (unfiltered) + spend/order
// data for each buyer over a trailing 90-day window.
// Filtering (status, suggested_only, search, last_ordered) is done client-side.

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag(FEATURE_FLAGS.BUYER_APP, claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch buyers + recent orders in parallel
    const [buyersResult, appOrdersResult, offlineOrdersResult] = await Promise.all([
      db
        .schema('app')
        .from('buyers')
        .select('id, business_name, contact_name, phone, geography, buyer_app_enabled, tier')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('business_name', { ascending: true }),
      db
        .schema('app')
        .from('orders')
        .select('buyer_id, total_amount, placed_at')
        .eq('tenant_id', tenantId)
        .eq('source', 'buyer_app')
        .gte('placed_at', ninetyDaysAgo)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('orders')
        .select('buyer_id, total_amount')
        .eq('tenant_id', tenantId)
        .neq('source', 'buyer_app')
        .gte('placed_at', ninetyDaysAgo)
        .is('deleted_at', null),
    ]);

    if (buyersResult.error) {
      return NextResponse.json({ error: 'Failed to fetch buyers' }, { status: 500 });
    }

    // Aggregate app orders per buyer
    const appOrdersByBuyer = new Map<
      string,
      { gmv: number; last_order_at: string; orders_30d: number }
    >();
    for (const row of appOrdersResult.data ?? []) {
      const existing = appOrdersByBuyer.get(row.buyer_id);
      const amount = Number(row.total_amount ?? 0);
      const isRecent = row.placed_at >= thirtyDaysAgo;
      if (!existing) {
        appOrdersByBuyer.set(row.buyer_id, {
          gmv: amount,
          last_order_at: row.placed_at,
          orders_30d: isRecent ? 1 : 0,
        });
      } else {
        existing.gmv += amount;
        existing.orders_30d += isRecent ? 1 : 0;
        if (row.placed_at > existing.last_order_at) {
          existing.last_order_at = row.placed_at;
        }
      }
    }

    // Aggregate offline orders per buyer
    const offlineSpendByBuyer = new Map<string, number>();
    for (const row of offlineOrdersResult.data ?? []) {
      const prev = offlineSpendByBuyer.get(row.buyer_id) ?? 0;
      offlineSpendByBuyer.set(row.buyer_id, prev + Number(row.total_amount ?? 0));
    }

    // Build enriched buyer list
    const buyers: AccessBuyer[] = (buyersResult.data ?? []).map((b: any) => {
      const appData = appOrdersByBuyer.get(b.id);
      const offlineSpend = offlineSpendByBuyer.get(b.id) ?? 0;
      const appGmv = appData?.gmv ?? 0;
      const hasAppOrder30d = (appData?.orders_30d ?? 0) > 0;

      return {
        id: b.id,
        business_name: b.business_name,
        contact_name: b.contact_name ?? null,
        phone: b.phone ?? null,
        city: (b.geography as any)?.city ?? null,
        state: (b.geography as any)?.state ?? null,
        buyer_app_enabled: Boolean(b.buyer_app_enabled),
        last_app_order_at: appData?.last_order_at ?? null,
        offline_spend_90d: offlineSpend,
        total_spend_90d: offlineSpend + appGmv,
        app_gmv_90d: appGmv,
        is_suggested: !b.buyer_app_enabled && offlineSpend > 0,
        is_inactive: Boolean(b.buyer_app_enabled) && !hasAppOrder30d,
      };
    });

    // KPIs — always computed from full unfiltered buyer list
    const kpis: AccessKpis = {
      enabled_count: buyers.filter((b) => b.buyer_app_enabled).length,
      not_enabled_count: buyers.filter((b) => !b.buyer_app_enabled).length,
      suggested_count: buyers.filter((b) => b.is_suggested).length,
      inactive_count: buyers.filter((b) => b.is_inactive).length,
      total_count: buyers.length,
    };

    const response: AccessPageResponse = { kpis, buyers };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/tenant/buyer-app/access]', error);
    return NextResponse.json({ error: 'Failed to load buyer app access data' }, { status: 500 });
  }
}

// ─── PATCH /api/tenant/buyer-app/access ─────────────────────────────────────
// Bulk-toggle buyer_app_enabled for one or more buyers.
// Restricted to seller_admin.

const BulkToggleSchema = z.object({
  buyer_ids: z.array(z.string().uuid()).min(1, 'At least one buyer ID is required'),
  enabled: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag(FEATURE_FLAGS.BUYER_APP, claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = BulkToggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 422 },
      );
    }

    const db = supabaseAdmin as any;
    const { buyer_ids, enabled } = parsed.data;

    const { data: updated, error: updateError } = await db
      .schema('app')
      .from('buyers')
      .update({ buyer_app_enabled: enabled, updated_at: new Date().toISOString() })
      .in('id', buyer_ids)
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .select('id');

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update buyer app access' }, { status: 500 });
    }

    // Audit log (fire-and-forget)
    let actorUserId: string | null = null;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const payload = decodeJWTPayload(token);
        actorUserId = (payload.sub as string) ?? null;
      } catch {
        // ignore
      }
    }

    if ((updated ?? []).length > 0) {
      void Promise.all(
        (updated as { id: string }[]).map((row) =>
          db.schema('app').from('audit_log').insert({
            tenant_id: claims.tenant_id,
            actor_user_id: actorUserId,
            entity_type: 'buyer',
            entity_id: row.id,
            action: 'update',
            diff: { buyer_app_enabled: enabled },
          }),
        ),
      );
    }

    return NextResponse.json({ updated_count: (updated ?? []).length });
  } catch (error) {
    console.error('[PATCH /api/tenant/buyer-app/access]', error);
    return NextResponse.json({ error: 'Failed to update buyer app access' }, { status: 500 });
  }
}
