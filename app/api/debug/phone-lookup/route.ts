import { NextRequest, NextResponse } from 'next/server';
import { normalizeIndianPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * DEBUG ENDPOINT: Check why a phone number isn't found
 * GET /api/debug/phone-lookup?phone=9490744841
 */
export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  const phone = request.nextUrl.searchParams.get('phone')?.trim() ?? '';
  if (!phone) {
    return NextResponse.json({ error: 'phone param required' }, { status: 400 });
  }

  const normalized = normalizeIndianPhone(phone);

  try {
    const [buyersRes, buyerUsersRes, sellerInvitesRes] = await Promise.all([
      supabaseAdmin
        .schema('app')
        .from('buyers')
        .select(`
          id,
          tenant_id,
          business_name,
          contact_name,
          phone,
          buyer_app_enabled,
          is_active,
          deleted_at,
          created_at,
          tenants!tenant_id(id, business_name, slug)
        `)
        .eq('phone', normalized),
      supabaseAdmin
        .schema('app')
        .from('buyer_users')
        .select(`
          id,
          buyer_id,
          user_id,
          role,
          phone,
          is_active,
          deleted_at,
          created_at,
          buyers!buyer_id(
            id,
            tenant_id,
            business_name,
            contact_name,
            buyer_app_enabled,
            is_active,
            deleted_at,
            tenants!tenant_id(id, business_name, slug)
          )
        `)
        .eq('phone', normalized),
      supabaseAdmin
        .schema('app')
        .from('tenant_users')
        .select(`
          id,
          tenant_id,
          user_id,
          role,
          full_name,
          email,
          phone,
          is_active,
          invited_at,
          joined_at,
          deleted_at,
          created_at,
          tenants!tenant_id(id, business_name, slug)
        `)
        .eq('phone', normalized),
    ]);

    return NextResponse.json({
      input_phone: phone,
      normalized_phone: normalized,
      buyers: {
        count: buyersRes.data?.length ?? 0,
        data: buyersRes.data ?? [],
        error: buyersRes.error?.message,
      },
      buyer_users: {
        count: buyerUsersRes.data?.length ?? 0,
        data: buyerUsersRes.data ?? [],
        error: buyerUsersRes.error?.message,
      },
      seller_invites: {
        count: sellerInvitesRes.data?.length ?? 0,
        data: sellerInvitesRes.data ?? [],
        error: sellerInvitesRes.error?.message,
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
