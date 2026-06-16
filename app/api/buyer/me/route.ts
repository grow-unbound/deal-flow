import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerAppMode } from '@/types/buyer';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';

interface BuyerMeResponse {
  mode: BuyerAppMode;
  buyer_id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  gstin: string | null;
  credit_limit: number;
  credit_used: number;
  open_orders_count: number;
  seller_preview: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  greeting_name?: string | null;
  order_features: {
    enquiries: boolean;
    sales_orders: boolean;
    invoices: boolean;
  };
  business_policy: {
    credit_enabled: boolean;
    gst_inclusive: boolean;
  };
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

    // Fetch tenant settings to surface order features and business policy
    const { data: tsRow } = await db
      .schema('app')
      .from('tenant_settings')
      .select('settings')
      .eq('tenant_id', context.tenant_id)
      .maybeSingle();

    const rawSettings = (tsRow as { settings?: Record<string, unknown> } | null)?.settings ?? {};
    const rawOrders = (rawSettings.orders ?? {}) as Record<string, unknown>;
    const rawFeatures = (rawOrders.features ?? {}) as Record<string, unknown>;
    const rawPolicy = (rawSettings.business_policy ?? {}) as Record<string, unknown>;

    const orderFeatures = {
      enquiries: rawFeatures.enquiries === true,
      sales_orders: rawFeatures.sales_orders === true,
      invoices: rawFeatures.invoices === true,
    };
    const businessPolicy = {
      credit_enabled: rawPolicy.credit_enabled !== false,
      gst_inclusive: rawPolicy.gst_inclusive === true,
    };

    // Pure seller preview (no linked buyer account)
    if (context.mode === 'preview' && !context.buyer_id) {
      if (!profile.tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      const tenant = profile.tenant;
      const payload: BuyerMeResponse = {
        mode: 'preview',
        buyer_id: 'preview',
        business_name: 'Buyer app preview',
        contact_name: 'Preview user',
        phone: '—',
        gstin: null,
        credit_limit: 0,
        credit_used: 0,
        open_orders_count: 0,
        seller_preview: true,
        tenant: {
          id: tenant.id,
          name: tenant.business_name,
          slug: tenant.slug,
        },
        greeting_name: 'Preview',
        order_features: orderFeatures,
        business_policy: businessPolicy,
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
      mode: context.mode,
      buyer_id: buyer.id,
      business_name: buyer.business_name,
      contact_name: buyer.contact_name ?? '',
      phone: buyer.phone ?? '—',
      gstin: buyer.gstin ?? null,
      credit_limit: Number(buyer.credit_limit ?? 0),
      credit_used: creditUsed,
      open_orders_count: openOrdersCount,
      seller_preview: false,
      tenant: {
        id: tenant.id,
        name: tenant.business_name,
        slug: tenant.slug,
      },
      greeting_name: profile.greeting_name,
      order_features: orderFeatures,
      business_policy: businessPolicy,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[GET /api/buyer/me] unexpected error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
