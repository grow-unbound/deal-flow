import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';

const PutSchema = z.object({
  header_hash: z.string().min(16).max(128),
  mapping: z.record(z.string()),
});

export async function GET(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  const admin = assertSellerAdmin(claims);
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: admin.status });
  }
  if (!supabaseAdmin || !claims.tenant_id) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const hash = new URL(req.url).searchParams.get('hash');
  if (!hash) {
    return NextResponse.json({ error: 'hash is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('import_column_maps')
    .select('mapping')
    .eq('tenant_id', claims.tenant_id)
    .eq('header_hash', hash)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mapping: (data?.mapping as Record<string, string> | undefined) ?? null });
}

export async function PUT(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  const admin = assertSellerAdmin(claims);
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: admin.status });
  }
  if (!supabaseAdmin || !claims.tenant_id) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const parsed = PutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const actorId = claims.sub ?? claims.tenant_id;
  const { data: existing } = await supabaseAdmin
    .schema('app')
    .from('import_column_maps')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('header_hash', parsed.data.header_hash)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .schema('app')
      .from('import_column_maps')
      .update({
        mapping: parsed.data.mapping,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.schema('app').from('import_column_maps').insert({
      tenant_id: claims.tenant_id,
      header_hash: parsed.data.header_hash,
      mapping: parsed.data.mapping,
      created_by: actorId,
      updated_by: actorId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
