import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { z } from 'zod';

const AddMembersSchema = z.object({
  buyer_ids: z.array(z.string().uuid()).min(1, 'At least one buyer is required'),
});

// GET: list current members of a cohort
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify cohort belongs to this tenant
  const { data: cohort } = await db
    .schema('app')
    .from('cohorts')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  const { data: members, error } = await db
    .schema('app')
    .from('cohort_members')
    .select('buyer_id, buyers!inner(id, business_name, tier, is_active)')
    .eq('cohort_id', id);

  if (error) {
    console.error('[GET /api/cohorts/[id]/members]', error.message);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }

  return NextResponse.json({ members: members ?? [] });
}

// POST: add buyers to a static cohort
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AddMembersSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify cohort belongs to this tenant and is static
  const { data: cohort } = await db
    .schema('app')
    .from('cohorts')
    .select('id, is_static')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  if (!cohort.is_static)
    return NextResponse.json(
      { error: 'Can only add members to static cohorts' },
      { status: 400 },
    );

  // Upsert members (ignore duplicates)
  const rows = parsed.data.buyer_ids.map((buyer_id) => ({ cohort_id: id, buyer_id }));
  const { error: insertError } = await db
    .schema('app')
    .from('cohort_members')
    .upsert(rows, { onConflict: 'cohort_id,buyer_id' });

  if (insertError) {
    console.error('[POST /api/cohorts/[id]/members]', insertError.message);
    return NextResponse.json({ error: 'Failed to add members' }, { status: 500 });
  }

  // Update cached_member_count
  const { count } = await db
    .schema('app')
    .from('cohort_members')
    .select('*', { count: 'exact', head: true })
    .eq('cohort_id', id);
  await db
    .schema('app')
    .from('cohorts')
    .update({ cached_member_count: count ?? 0 })
    .eq('id', id);

  return NextResponse.json({ ok: true, count }, { status: 200 });
}

// DELETE: remove a buyer from a static cohort (buyer_id in query string)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const buyerId = request.nextUrl.searchParams.get('buyer_id');
  if (!buyerId) return NextResponse.json({ error: 'buyer_id required' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify cohort belongs to this tenant
  const { data: cohort } = await db
    .schema('app')
    .from('cohorts')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  await db.schema('app').from('cohort_members').delete().eq('cohort_id', id).eq('buyer_id', buyerId);

  // Update cached_member_count
  const { count } = await db
    .schema('app')
    .from('cohort_members')
    .select('*', { count: 'exact', head: true })
    .eq('cohort_id', id);
  await db
    .schema('app')
    .from('cohorts')
    .update({ cached_member_count: count ?? 0 })
    .eq('id', id);

  return NextResponse.json({ ok: true, count });
}
