import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { UpdateMemberSchema } from '@/lib/zod';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import {
  findDuplicateMember,
  getTenantMemberDirectory,
} from '@/lib/team-members';

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = UpdateMemberSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation error', details: validation.error.flatten() },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: member, error: fetchError } = await db
    .schema('app')
    .from('tenant_users')
    .select('id, user_id, role, location_ids, is_active')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .single();

  if (fetchError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const locationIds = validation.data.role === 'seller_assistant'
    ? (validation.data.location_ids ?? [])
    : null;

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

  const directory = await getTenantMemberDirectory(claims.tenant_id);
  const conflict = findDuplicateMember(directory, {
    email: validation.data.email,
    phone: validation.data.phone,
    excludeMemberId: member.id,
  });

  if (conflict) {
    const fieldErrors: Record<string, string[]> = {};
    if (conflict.email) {
      fieldErrors.email = ['This email is already used in this tenant.'];
    }
    if (conflict.phone) {
      fieldErrors.phone = ['This phone number is already used in this tenant.'];
    }

    return NextResponse.json(
      { error: 'Duplicate member details found', fieldErrors },
      { status: 409 },
    );
  }

  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(member.user_id, {
    email: validation.data.email,
    user_metadata: {
      full_name: validation.data.full_name,
      phone: validation.data.phone,
    },
  });

  if (authUpdateError) {
    return NextResponse.json(
      { error: 'Failed to update user profile', details: authUpdateError.message },
      { status: 500 },
    );
  }

  const { error } = await db
    .schema('app')
    .from('tenant_users')
    .update({
      full_name: validation.data.full_name,
      email: validation.data.email,
      phone: validation.data.phone,
      role: validation.data.role,
      location_ids: locationIds,
      updated_by: claims.tenant_id,
    })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(_request);

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
  const { error } = await db
    .schema('app')
    .from('tenant_users')
    .update({
      is_active: false,
      updated_by: claims.tenant_id,
    })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to deactivate member' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
