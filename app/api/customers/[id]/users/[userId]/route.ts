import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { BuyerUserSchema } from '@/lib/zod';

async function ensureBuyerUser(db: any, tenantId: string, buyerId: string, userId: string) {
  const { data: buyer } = await db
    .schema('app')
    .from('buyers')
    .select('id')
    .eq('id', buyerId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!buyer) {
    return null;
  }

  const { data, error } = await db
    .schema('app')
    .from('buyer_users')
    .select('id, buyer_id, user_id, deleted_at')
    .eq('id', userId)
    .eq('buyer_id', buyerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

function buyerUserSelect() {
  return 'id, buyer_id, user_id, first_name, last_name, phone, email, designation, department, is_active, created_at, updated_at, deleted_at';
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin as any;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BuyerUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  if (!(await ensureBuyerUser(db, claims.tenant_id, id, userId))) {
    return NextResponse.json({ error: 'Buyer user not found' }, { status: 404 });
  }

  const { data: duplicate } = await db
    .schema('app')
    .from('buyer_users')
    .select('id')
    .eq('buyer_id', id)
    .eq('phone', parsed.data.phone)
    .neq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (duplicate) {
    return NextResponse.json({ error: 'A buyer user with this phone number already exists.' }, { status: 409 });
  }

  const { data: user, error } = await db
    .schema('app')
    .from('buyer_users')
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      designation: parsed.data.designation || null,
      updated_at: new Date().toISOString(),
      updated_by: claims.sub,
    })
    .eq('id', userId)
    .eq('buyer_id', id)
    .select(buyerUserSelect())
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update buyer user' }, { status: 500 });
  }

  return NextResponse.json({ user });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin as any;

  if (!(await ensureBuyerUser(db, claims.tenant_id, id, userId))) {
    return NextResponse.json({ error: 'Buyer user not found' }, { status: 404 });
  }

  const { error } = await db
    .schema('app')
    .from('buyer_users')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: claims.sub,
    })
    .eq('id', userId)
    .eq('buyer_id', id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete buyer user' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
