import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';

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
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: member, error: fetchError } = await db
    .schema('app')
    .from('tenant_users')
    .select('id, user_id, is_active')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .single();

  if (fetchError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (member.is_active) {
    return NextResponse.json({ error: 'Member is already active' }, { status: 400 });
  }

  // Get the email from auth.users
  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(member.user_id);

  if (authError || !authUser.user?.email) {
    return NextResponse.json({ error: 'Could not retrieve user email' }, { status: 500 });
  }

  // Re-send the invite
  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    authUser.user.email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/accept-invite`,
      data: { tenant_id: claims.tenant_id, role: member.role },
    },
  );

  if (inviteError) {
    return NextResponse.json(
      { error: 'Failed to resend invite', details: inviteError.message },
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
