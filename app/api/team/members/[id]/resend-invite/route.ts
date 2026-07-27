import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { sendSellerTeamActivationInvite } from '@/lib/server/seller-team-activation';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden: seller_admin only' }, { status: 403 });
  }
  const flagEnabled = await getFlag('df_tenant_onboarding', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: member, error: fetchError } = await db
    .schema('app')
    .from('tenant_users')
    .select('id, user_id, role, is_active, full_name, phone')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .single();

  if (fetchError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (member.is_active) {
    return NextResponse.json({ error: 'Member is already active' }, { status: 400 });
  }

  if (!member.phone) {
    return NextResponse.json({ error: 'Valid WhatsApp phone is required to resend an invite' }, { status: 400 });
  }

  const { data: tenantRow, error: tenantError } = await db
    .schema('app')
    .from('tenants')
    .select('business_name')
    .eq('id', claims.tenant_id)
    .maybeSingle();

  if (tenantError || !tenantRow?.business_name) {
    return NextResponse.json(
      { error: 'Failed to load tenant details', details: tenantError?.message },
      { status: 500 },
    );
  }

  try {
    await sendSellerTeamActivationInvite({
      tenantId: claims.tenant_id,
      tenantName: tenantRow.business_name,
      fullName: member.full_name ?? 'there',
      phone: member.phone,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to resend invite', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  await db
    .schema('app')
    .from('tenant_users')
    .update({ invited_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ success: true, message: 'Invite resent' });
}
