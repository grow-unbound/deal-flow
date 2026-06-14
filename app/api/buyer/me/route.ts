import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerAppMode } from '@/types/buyer';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';

interface BuyerMeResponse {
  mode: BuyerAppMode;
  buyer_id: string;
  business_name: string;
  contact_name: string;
  credit_limit: number;
  credit_used: number;
  open_orders_count: number;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  greeting_name?: string | null;
}

const OPEN_STATUSES = ['draft', 'received', 'confirmed', 'partially_dispatched', 'dispatched'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const context = profile.context;
    const db = supabaseAdmin;
    const buyerId = profile.buyer?.id ?? context.buyer_id;

    if (context.mode === 'preview') {
      if (!profile.tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      const tenant = profile.tenant;
      const payload: BuyerMeResponse = {
        mode: 'preview',
        buyer_id: 'preview',
        business_name: 'Buyer app preview',
        contact_name: 'Preview user',
        credit_limit: 0,
        credit_used: 0,
        open_orders_count: 0,
        tenant: {
          id: tenant.id,
          name: tenant.business_name,
          slug: tenant.slug,
        },
        greeting_name: 'Preview',
      };

      return NextResponse.json(payload);
    }

    if (!buyerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [ordersRes] = await Promise.all([
      db
        .schema('app')
        .from('orders')
        .select('id, total_amount, status')
        .eq('buyer_id', buyerId)
        .in('status', OPEN_STATUSES)
        .is('deleted_at', null),
    ]);

    if (!profile.buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    if (!profile.tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (ordersRes.error) {
      console.error('[GET /api/buyer/me] orders query error:', ordersRes.error);
      return NextResponse.json({ error: 'Failed to compute credit used' }, { status: 500 });
    }

    const openOrders = ordersRes.data ?? [];
    const creditUsed = openOrders.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
    const openOrdersCount = openOrders.length;

    const buyer = profile.buyer;
    const tenant = profile.tenant;

    const payload: BuyerMeResponse = {
      mode: 'buyer',
      buyer_id: buyer.id,
      business_name: buyer.business_name,
      contact_name: buyer.contact_name ?? '',
      credit_limit: Number(buyer.credit_limit ?? 0),
      credit_used: creditUsed,
      open_orders_count: openOrdersCount,
      tenant: {
        id: tenant.id,
        name: tenant.business_name,
        slug: tenant.slug,
      },
      greeting_name: profile.greeting_name,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[GET /api/buyer/me] unexpected error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
