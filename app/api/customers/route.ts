import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { BuyerCreateSchema } from '@/lib/zod';

export async function GET(request: NextRequest) {
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

  // supabaseAdmin typed client does not expose .schema() on the TS interface.
  // Cast to any mirrors the pattern in app/api/team/members/route.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('buyers')
    .select('*')
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .order('business_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }

  return NextResponse.json({ buyers: rows ?? [] });
}

export async function POST(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BuyerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // supabaseAdmin typed client does not expose .schema() on the TS interface.
  // Cast to any mirrors the pattern in app/api/team/members/route.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Phone uniqueness check per tenant
  const { data: phoneMatch } = await db
    .schema('app')
    .from('buyers')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('phone', data.phone)
    .is('deleted_at', null)
    .maybeSingle();

  if (phoneMatch) {
    return NextResponse.json(
      { error: 'A buyer with this phone number already exists.' },
      { status: 409 },
    );
  }

  // external_ref uniqueness check per tenant (only if provided)
  if (data.external_ref && data.external_ref.trim() !== '') {
    const { data: refMatch } = await db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('external_ref', data.external_ref.trim())
      .is('deleted_at', null)
      .maybeSingle();

    if (refMatch) {
      return NextResponse.json(
        { error: 'A buyer with this ERP reference already exists.' },
        { status: 409 },
      );
    }
  }

  const { data: buyer, error: insertError } = await db
    .schema('app')
    .from('buyers')
    .insert({
      tenant_id: claims.tenant_id,
      business_name: data.business_name,
      contact_name: data.contact_name ?? null,
      phone: data.phone,
      email: data.email || null,
      gstin: data.gstin ?? null,
      geography: data.geography ?? null,
      credit_limit: data.credit_limit,
      payment_terms_days: data.payment_terms_days,
      tier: data.tier ?? null,
      external_ref: data.external_ref?.trim() || null,
      is_active: true,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }

  return NextResponse.json({ buyer }, { status: 201 });
}
