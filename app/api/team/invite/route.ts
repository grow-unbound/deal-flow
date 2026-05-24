import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { InviteUserSchema } from '@/lib/zod';
import { extractVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

export async function POST(request: NextRequest) {
  const claims = extractVerifiedClaims(request);

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = InviteUserSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation error', details: validation.error.flatten() },
      { status: 400 },
    );
  }

  const { email, role } = validation.data;

  // Check if this email already belongs to an active member of this tenant
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingAuthUser = existingUsers?.users.find((u) => u.email === email);

  if (existingAuthUser) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: existing } = await db
      .schema('app')
      .from('tenant_users')
      .select('id, is_active')
      .eq('tenant_id', claims.tenant_id)
      .eq('user_id', existingAuthUser.id)
      .maybeSingle();

    if (existing?.is_active) {
      return NextResponse.json(
        { error: 'This user is already a member of your workspace.' },
        { status: 409 },
      );
    }

    // Pending invite already exists — resend via same flow below
  }

  // Create/invite the Supabase Auth user
  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/accept-invite`,
      data: { tenant_id: claims.tenant_id, role },
    });

  if (inviteError || !inviteData.user) {
    return NextResponse.json(
      { error: 'Failed to send invite', details: inviteError?.message },
      { status: 500 },
    );
  }

  // If a pending row already exists for this user+tenant, update it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: pendingRow } = await db
    .schema('app')
    .from('tenant_users')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('user_id', inviteData.user.id)
    .maybeSingle();

  if (pendingRow) {
    await db
      .schema('app')
      .from('tenant_users')
      .update({ role, invited_at: new Date().toISOString(), is_active: false })
      .eq('id', pendingRow.id);
  } else {
    const { error: insertError } = await db
      .schema('app')
      .from('tenant_users')
      .insert({
        tenant_id: claims.tenant_id,
        user_id: inviteData.user.id,
        role,
        is_active: false,
        invited_at: new Date().toISOString(),
        created_by: claims.tenant_id,
        updated_by: claims.tenant_id,
      });

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to create team member record', details: insertError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { success: true, message: `Invite sent to ${email}` },
    { status: 201 },
  );
}
