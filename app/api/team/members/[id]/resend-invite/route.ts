import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

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
    .select('id, user_id, role, is_active')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .single();

  if (fetchError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (member.is_active) {
    return NextResponse.json({ error: 'Member is already active' }, { status: 400 });
  }

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(member.user_id);

  if (authError || !authUser.user?.email) {
    return NextResponse.json({ error: 'Could not retrieve user email' }, { status: 500 });
  }

  const isConfirmed = !!authUser.user.email_confirmed_at;

  if (isConfirmed) {
    // User already confirmed their email but accept-invite never ran (is_active still false).
    // Can't re-send an invite link (Supabase rejects it for confirmed users), so send a
    // password-recovery link instead — same UX: user clicks link, lands on /setup-password,
    // sets password, accept-invite activates them.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      authUser.user.email,
      { redirectTo: `${appUrl}/setup-password` },
    );

    if (resetError) {
      return NextResponse.json(
        { error: 'Failed to resend invite', details: resetError.message },
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

  // User is unconfirmed — resend the invite via Supabase (Supabase sends the email).
  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    authUser.user.email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/setup-password`,
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
