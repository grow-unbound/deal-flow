import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
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

  const { id, assignmentId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: pl } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const { data: existingAssignment } = await db
    .schema('app')
    .from('price_list_assignments')
    .select('id')
    .eq('id', assignmentId)
    .eq('price_list_id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existingAssignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  const { error: deleteError } = await db
    .schema('app')
    .from('price_list_assignments')
    .update({ deleted_at: new Date().toISOString(), updated_by: claims.sub })
    .eq('id', assignmentId);

  if (deleteError) {
    console.error(
      '[DELETE /api/price-lists/[id]/assignments/[assignmentId]] DB error:',
      deleteError.code,
      deleteError.message,
    );
    return NextResponse.json(
      { error: 'Failed to delete assignment', code: deleteError.code, detail: deleteError.message },
      { status: 500 },
    );
  }

  await db.schema('app').from('audit_log').insert({
    tenant_id: claims.tenant_id,
    actor_user_id: claims.sub,
    entity_type: 'price_list',
    entity_id: id,
    action: 'delete',
    diff: { event: 'assignment_removed', assignment_id: assignmentId },
    ts: new Date().toISOString(),
  });

  return new NextResponse(null, { status: 204 });
}
