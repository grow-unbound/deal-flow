import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { CohortUpdateSchema } from '@/lib/zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: cohort, error } = await db.schema('app').from('cohorts')
    .select('*').eq('id', id).eq('tenant_id', claims.tenant_id).is('is_active', true).maybeSingle();

  if (error) return NextResponse.json({ error: 'Failed to fetch cohort' }, { status: 500 });
  if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  return NextResponse.json({ cohort });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = CohortUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 422 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify ownership
  const { data: existing } = await db.schema('app').from('cohorts')
    .select('id').eq('id', id).eq('tenant_id', claims.tenant_id).is('is_active', true).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  // If name is changing, check uniqueness
  if (parsed.data.name) {
    const { data: nameMatch } = await db.schema('app').from('cohorts')
      .select('id').eq('tenant_id', claims.tenant_id).eq('name', parsed.data.name)
      .is('is_active', true).neq('id', id).maybeSingle();
    if (nameMatch) return NextResponse.json({ error: 'A cohort with this name already exists.' }, { status: 409 });
  }

  const { data: cohort, error: updateError } = await db.schema('app').from('cohorts')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('[PATCH /api/cohorts/[id]]', updateError.message);
    return NextResponse.json({ error: 'Failed to update cohort' }, { status: 500 });
  }

  return NextResponse.json({ cohort });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify ownership
  const { data: cohort } = await db.schema('app').from('cohorts')
    .select('id').eq('id', id).eq('tenant_id', claims.tenant_id).is('is_active', true).maybeSingle();
  if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  // Check if referenced by any published catalog (scope_value JSONB contains cohort_id)
  const { data: activeCatalogs } = await db.schema('app').from('published_catalogs')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('status', 'published')
    .eq('scope_type', 'cohort')
    .contains('scope_value', { cohort_id: id });

  if (activeCatalogs && activeCatalogs.length > 0) {
    return NextResponse.json(
      { error: 'This cohort is used in an active catalog. Archive the catalog before deleting the cohort.', code: 'COHORT_IN_USE' },
      { status: 409 }
    );
  }

  // Soft delete
  const { error: deleteError } = await db.schema('app').from('cohorts')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id);

  if (deleteError) {
    console.error('[DELETE /api/cohorts/[id]]', deleteError.message);
    return NextResponse.json({ error: 'Failed to delete cohort' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
