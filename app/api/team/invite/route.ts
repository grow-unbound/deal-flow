import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { InviteUserSchema } from '@/lib/zod';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import {
  findDuplicateMember,
  getTenantMemberDirectory,
} from '@/lib/team-members';
import { ensureSellerAuthIdentity, sendSellerTeamActivationInvite } from '@/lib/server/seller-team-activation';

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
  const locationIds = role === 'seller_assistant' ? (validation.data.location_ids ?? []) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
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

  if (locationIds && locationIds.length > 0) {
    const { data: locations, error: locationsError } = await db
      .schema('app')
      .from('locations')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .in('id', locationIds);

    if (locationsError) {
      return NextResponse.json(
        { error: 'Failed to validate location access', details: locationsError.message },
        { status: 500 },
      );
    }

    if ((locations ?? []).length !== locationIds.length) {
      return NextResponse.json(
        {
          error: 'Validation error',
          fieldErrors: {
            location_ids: ['Select valid active locations for this assistant.'],
          },
        },
        { status: 400 },
      );
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();

  let userId: string;
  try {
    const authIdentity = await ensureSellerAuthIdentity({
      email: normalizedEmail,
      fullName: full_name,
      phone: normalizedPhone,
      tenantId: claims.tenant_id,
    });
    userId = authIdentity.userId;
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to prepare user account', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  // The auth user now exists or has been updated by Supabase; create the tenant link row.
  const { error: insertError } = await db
    .schema('app')
    .from('tenant_users')
    .insert({
      tenant_id: claims.tenant_id,
      user_id: userId,
      full_name,
      email: normalizedEmail,
      phone: normalizedPhone,
      role,
      location_ids: locationIds,
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

  const { data: tenantRow, error: tenantError } = await db
    .schema('app')
    .from('tenants')
    .select('business_name')
    .eq('id', claims.tenant_id)
    .maybeSingle();

  if (tenantError || !tenantRow?.business_name) {
    return NextResponse.json(
      { error: 'Failed to load tenant details for invite', details: tenantError?.message },
      { status: 500 },
    );
  }

  try {
    await sendSellerTeamActivationInvite({
      tenantId: claims.tenant_id,
      tenantName: tenantRow.business_name,
      fullName: full_name,
      phone: normalizedPhone,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send WhatsApp invite', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { success: true, message: `Invite sent to ${normalizedPhone}` },
    { status: 201 },
  );
}
