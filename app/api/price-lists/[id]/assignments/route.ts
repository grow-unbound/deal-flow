import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { PriceListAssignmentSchema } from '@/lib/zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify the price list belongs to this tenant
  const { data: pl } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const { data: assignments, error } = await db
    .schema('app')
    .from('price_list_assignments')
    .select('*')
    .eq('price_list_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[GET /api/price-lists/[id]/assignments] DB error:', error.code, error.message);
    return NextResponse.json(
      { error: 'Failed to fetch assignments', code: error.code, detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ assignments: assignments ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PriceListAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify the price list belongs to this tenant
  const { data: pl } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  // Verify target exists within tenant
  if (data.target_type === 'buyer') {
    const { data: buyer } = await db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('id', data.target_id)
      .eq('tenant_id', claims.tenant_id)
      .is('is_active', true)
      .maybeSingle();

    if (!buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }
  } else if (data.target_type === 'cohort') {
    const { data: cohort } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('id', data.target_id)
      .eq('tenant_id', claims.tenant_id)
      .is('is_active', true)
      .maybeSingle();

    if (!cohort) {
      return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
    }
  }

  const { data: assignment, error: insertError } = await db
    .schema('app')
    .from('price_list_assignments')
    .insert({
      price_list_id: id,
      target_type: data.target_type,
      target_id: data.target_type === 'all_buyers' ? null : (data.target_id ?? null),
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'This price list is already assigned to that target.' },
        { status: 409 },
      );
    }
    console.error(
      '[POST /api/price-lists/[id]/assignments] DB error:',
      insertError.code,
      insertError.message,
    );
    return NextResponse.json(
      { error: 'Failed to add assignment', code: insertError.code, detail: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ assignment }, { status: 201 });
}
