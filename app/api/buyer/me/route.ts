import { NextRequest, NextResponse } from 'next/server';
import { getBuyerAppContext } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerAppMode } from '@/types/buyer';

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
}

const OPEN_STATUSES = ['draft', 'received', 'confirmed', 'partially_dispatched', 'dispatched'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await getBuyerAppContext(request);

    if (!context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin;
    const buyerId = context.buyer_id;
    const tenantId = context.tenant_id;

    if (context.mode === 'preview') {
      const tenantRes = await db
        .schema('app')
        .from('tenants')
        .select('id, business_name, slug')
        .eq('id', tenantId)
        .single();

      if (tenantRes.error || !tenantRes.data) {
        console.error('[GET /api/buyer/me] tenant query error:', tenantRes.error);
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      const tenant = tenantRes.data;
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
      };

      return NextResponse.json(payload);
    }

    if (!buyerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [buyerRes, tenantRes, ordersRes] = await Promise.all([
      db
        .schema('app')
        .from('buyers')
        .select('id, business_name, contact_name, credit_limit')
        .eq('id', buyerId)
        .is('deleted_at', null)
        .single(),
      db
        .schema('app')
        .from('tenants')
        .select('id, business_name, slug')
        .eq('id', tenantId)
        .single(),
      db
        .schema('app')
        .from('orders')
        .select('id, total_amount, status')
        .eq('buyer_id', buyerId)
        .in('status', OPEN_STATUSES)
        .is('deleted_at', null),
    ]);

    if (buyerRes.error || !buyerRes.data) {
      console.error('[GET /api/buyer/me] buyer query error:', buyerRes.error);
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    if (tenantRes.error || !tenantRes.data) {
      console.error('[GET /api/buyer/me] tenant query error:', tenantRes.error);
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (ordersRes.error) {
      console.error('[GET /api/buyer/me] orders query error:', ordersRes.error);
      return NextResponse.json({ error: 'Failed to compute credit used' }, { status: 500 });
    }

    const openOrders = ordersRes.data ?? [];
    const creditUsed = openOrders.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
    const openOrdersCount = openOrders.length;

    const buyer = buyerRes.data;
    const tenant = tenantRes.data;

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
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[GET /api/buyer/me] unexpected error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
