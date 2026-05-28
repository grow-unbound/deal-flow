import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { CohortCreateSchema } from '@/lib/zod';

export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('cohorts')
    .select('*')
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/cohorts] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch cohorts' }, { status: 500 });
  }

  return NextResponse.json({ cohorts: rows ?? [] });
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
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

  const parsed = CohortCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Uniqueness check: cohort name per tenant
  const { data: nameMatch } = await db
    .schema('app')
    .from('cohorts')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('name', data.name)
    .is('is_active', true)
    .maybeSingle();

  if (nameMatch) {
    return NextResponse.json(
      { error: 'A cohort with this name already exists.' },
      { status: 409 },
    );
  }

  const { data: cohort, error: insertError } = await db
    .schema('app')
    .from('cohorts')
    .insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      description: data.description ?? null,
      is_static: data.is_static,
      rules: data.rules ?? null,
      created_by: null,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[POST /api/cohorts] DB error:', insertError.code, insertError.message);
    return NextResponse.json({ error: 'Failed to create cohort' }, { status: 500 });
  }

  return NextResponse.json({ cohort }, { status: 201 });
}
