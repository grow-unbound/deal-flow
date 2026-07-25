import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const listPrice = Number(body.price);
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    return NextResponse.json({ error: 'price must be a positive number' }, { status: 422 });
  }

  const { id, itemId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data, error } = await db.schema('app').rpc('price_list_update_item_price', {
    p_tenant_id: claims.tenant_id,
    p_price_list_id: id,
    p_item_id: itemId,
    p_list_price: listPrice,
    p_actor_user_id: claims.sub,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
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

  const { id, itemId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: pl } = await db
    .schema('app')
    .from('price_lists')
    .select('id, external_ref')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  // Externally-sourced (Zoho) price lists: membership/pricing come from the sync only.
  if (pl.external_ref) {
    return NextResponse.json(
      { error: 'This price list is managed by your Zoho integration. Products and prices sync automatically — edit them in Zoho.' },
      { status: 409 },
    );
  }

  const { data: existingItem } = await db
    .schema('app')
    .from('price_list_items')
    .select('id')
    .eq('id', itemId)
    .eq('price_list_id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existingItem) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const { error: deleteError } = await db
    .schema('app')
    .from('price_list_items')
    .update({ deleted_at: new Date().toISOString(), updated_by: claims.sub })
    .eq('id', itemId);

  if (deleteError) {
    console.error(
      '[DELETE /api/price-lists/[id]/items/[itemId]] DB error:',
      deleteError.code,
      deleteError.message,
    );
    return NextResponse.json(
      { error: 'Failed to delete item', code: deleteError.code, detail: deleteError.message },
      { status: 500 },
    );
  }

  await db.schema('app').from('audit_log').insert({
    tenant_id: claims.tenant_id,
    actor_user_id: claims.sub,
    entity_type: 'price_list',
    entity_id: id,
    action: 'delete',
    diff: { event: 'item_removed', item_id: itemId },
    ts: new Date().toISOString(),
  });

  return new NextResponse(null, { status: 204 });
}
