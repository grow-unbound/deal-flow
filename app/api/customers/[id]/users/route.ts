import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { BuyerUserSchema } from '@/lib/zod';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

async function ensureBuyerExists(db: any, tenantId: string, buyerId: string) {
  const { data, error } = await db
    .schema('app')
    .from('buyers')
    .select('id')
    .eq('id', buyerId)
    .eq('tenant_id', tenantId)
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  if (!(await ensureBuyerExists(db, claims.tenant_id, id))) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
  }

  const { data: users, error } = await db
    .schema('app')
    .from('buyer_users')
    .select(buyerUserSelect())
    .eq('buyer_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch buyer users' }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] }, { headers: SELLER_CACHE_PERSONAL });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  if (!(await ensureBuyerExists(db, claims.tenant_id, id))) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
  }

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

  const data = parsed.data;
  const { data: duplicate } = await db
    .schema('app')
    .from('buyer_users')
    .select('id')
    .eq('buyer_id', id)
    .eq('phone', data.phone)
    .is('deleted_at', null)
    .maybeSingle();

  if (duplicate) {
    return NextResponse.json({ error: 'A buyer user with this phone number already exists.' }, { status: 409 });
  }

  const { data: user, error } = await db
    .schema('app')
    .from('buyer_users')
    .insert({
      buyer_id: id,
      user_id: null,
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone,
      role: 'buyer_assistant',
      email: data.email || null,
      designation: data.designation || null,
      is_active: true,
      created_by: claims.sub,
      updated_by: claims.sub,
    })
    .select(buyerUserSelect())
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create buyer user' }, { status: 500 });
  }

  return NextResponse.json({ user }, { status: 201 });
}
