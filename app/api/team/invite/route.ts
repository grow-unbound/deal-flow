import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { InviteUserSchema } from '@/lib/zod';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import {
  findDuplicateMember,
  getTenantMemberDirectory,
} from '@/lib/team-members';

export async function POST(request: NextRequest) {
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

  const { email, full_name, phone, role } = validation.data;
  const directory = await getTenantMemberDirectory(claims.tenant_id);
  const conflict = findDuplicateMember(directory, { email, phone });

  if (conflict) {
    const fieldErrors: Record<string, string[]> = {};
    if (conflict.email) {
      fieldErrors.email = ['This email is already used in this tenant.'];
    }
    if (conflict.phone) {
      fieldErrors.phone = ['This phone number is already used in this tenant.'];
    }

    return NextResponse.json(
      {
        error: 'Duplicate member details found',
        fieldErrors,
      },
      { status: 409 },
    );
  }

  // Create/invite the Supabase Auth user
  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/accept-invite`,
      data: {
        tenant_id: claims.tenant_id,
        role,
        full_name,
        phone,
      },
    });

  if (inviteError || !inviteData.user) {
    return NextResponse.json(
      { error: 'Failed to send invite', details: inviteError?.message },
      { status: 500 },
    );
  }

  // The auth user now exists or has been updated by Supabase; create the tenant link row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
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

  return NextResponse.json(
    { success: true, message: `Invite sent to ${email}` },
    { status: 201 },
  );
}
