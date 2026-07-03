import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerAppMode } from '@/types/buyer';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';
import { normalizeIndianPhone } from '@/lib/phone';
import { BUYER_ROLES, SELLER_ROLES } from '@/constants';

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
  support_whatsapp_number: string | null;
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

function canEditBusiness(role: string | null | undefined): boolean {
  return role === 'buyer_admin' || (SELLER_ROLES as readonly string[]).includes((role ?? '') as any);
}

function canEditPhone(role: string | null | undefined): boolean {
  return (BUYER_ROLES as readonly string[]).includes((role ?? '') as any)
    || (SELLER_ROLES as readonly string[]).includes((role ?? '') as any);
}

function normalizePatchBody(body: Record<string, unknown>) {
  const next: {
    business_name?: string;
    contact_name?: string;
    gstin?: string | null;
    phone?: string;
  } = {};

  if (typeof body.business_name === 'string') {
    next.business_name = body.business_name.trim();
  }
  if (typeof body.contact_name === 'string') {
    next.contact_name = body.contact_name.trim();
  }
  if (typeof body.gstin === 'string') {
    const gstin = body.gstin.trim().toUpperCase();
    next.gstin = gstin.length > 0 ? gstin : null;
  }
  if (typeof body.phone === 'string') {
    next.phone = normalizeIndianPhone(body.phone);
  }

  return next;
}

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
      support_whatsapp_number: process.env.WHATSAPP_ADMIN_NUMBER ?? null,
      tenant: {
        id: tenant.id,
        name: tenant.business_name,
          slug: tenant.slug,
        },
        greeting_name: 'Preview',
        order_features: orderFeatures,
        business_policy: businessPolicy,
      };

      return NextResponse.json(payload, { headers: BUYER_CACHE_PERSONAL });
    }

    if (!buyerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = context.tenant_id!;
    const [ordersRes, creditSnapshot] = await Promise.all([
      db
        .schema('app')
        .from('orders')
        .select('id, total_amount, status')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .in('status', OPEN_STATUSES)
        .is('deleted_at', null),
      loadBuyerCreditSnapshot(db as any, {
        tenantId,
        buyerId,
        creditLimit: Number(profile.buyer?.credit_limit ?? 0),
      }),
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
      credit_used: creditSnapshot.credit_used,
      open_orders_count: openOrdersCount,
      seller_preview: false,
      support_whatsapp_number: process.env.WHATSAPP_ADMIN_NUMBER ?? null,
      tenant: {
        id: tenant.id,
        name: tenant.business_name,
        slug: tenant.slug,
      },
      greeting_name: profile.greeting_name,
      order_features: orderFeatures,
      business_policy: businessPolicy,
    };

    return NextResponse.json(payload, { headers: BUYER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/buyer/me] unexpected error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!profile.buyer || profile.context.mode === 'preview') {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const tenantId = profile.context.tenant_id;
    const buyerId = profile.buyer.id;
    const role = profile.context.role ?? null;
    const previousPhone = profile.buyer.phone ?? null;
    const businessAllowed = canEditBusiness(role);
    const phoneAllowed = canEditPhone(role);

    if (!businessAllowed && !phoneAllowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const normalized = normalizePatchBody(body);
    const updateData: Record<string, unknown> = {};

    if (businessAllowed) {
      if (normalized.business_name !== undefined) updateData.business_name = normalized.business_name;
      if (normalized.contact_name !== undefined) updateData.contact_name = normalized.contact_name;
      if (normalized.gstin !== undefined) updateData.gstin = normalized.gstin;
    }

    if (phoneAllowed && normalized.phone !== undefined) {
      updateData.phone = normalized.phone;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    if ('business_name' in updateData && typeof updateData.business_name === 'string' && updateData.business_name.length === 0) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 422 });
    }

    if ('phone' in updateData) {
      const phone = String(updateData.phone ?? '');
      if (!/^[0-9]{10}$/.test(phone)) {
        return NextResponse.json({ error: 'Phone must be 10 digits' }, { status: 422 });
      }
    }

    if ('gstin' in updateData && updateData.gstin !== null && typeof updateData.gstin === 'string' && !/^[0-9A-Z]{15}$/i.test(updateData.gstin)) {
      return NextResponse.json({ error: 'GSTIN must be 15 alphanumeric characters' }, { status: 422 });
    }

    const db = supabaseAdmin as any;

    if ('phone' in updateData && updateData.phone !== previousPhone) {
      const { data: phoneMatch, error: phoneError } = await db
        .schema('app')
        .from('buyers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', updateData.phone)
        .eq('is_active', true)
        .is('deleted_at', null)
        .neq('id', buyerId)
        .maybeSingle();

      if (phoneError) {
        return NextResponse.json({ error: 'Failed to validate phone number' }, { status: 500 });
      }

      if (phoneMatch) {
        return NextResponse.json({ error: 'A buyer with this phone number already exists.' }, { status: 409 });
      }
    }

    const { error: updateError } = await db
      .schema('app')
      .from('buyers')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', buyerId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    if ('phone' in updateData && updateData.phone !== previousPhone) {
      const { error: buyerUsersError } = await db
        .schema('app')
        .from('buyer_users')
        .update({
          phone: updateData.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('buyer_id', buyerId)
        .eq('is_active', true)
        .is('deleted_at', null);

      if (buyerUsersError) {
        return NextResponse.json({ error: 'Failed to update login phone number' }, { status: 500 });
      }
    }

    const response = await GET(request);
    if (!response.ok) {
      return NextResponse.json({ error: 'Profile updated, but refresh failed' }, { status: 500 });
    }
    return response;
  } catch (error) {
    console.error('[PATCH /api/buyer/me] unexpected error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
