import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';
import { CreateCategoryInputSchema } from '@/types/tenant-categories';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }

    if (!claims.role?.startsWith('seller_')) {
      return jsonError(403, 'Forbidden', 'FORBIDDEN');
    }

    const db = getRequestSupabaseClient() as any;
    const includeDeleted =
      req.nextUrl.searchParams.get('include_deleted') === '1' && claims.role === 'seller_admin';

    let q = db
      .schema('app')
      .from('tenant_categories')
      .select(
        'id, tenant_id, name, slug, description, display_order, external_ref, is_active, deleted_at, r2_image_original_key, r2_image_medium_key, r2_image_thumb_key, created_at, updated_at',
      )
      .eq('tenant_id', claims.tenant_id);

    if (!includeDeleted) {
      q = q.is('deleted_at', null);
    }

    const { data, error } = await q.order('display_order', { ascending: true }).order('name', { ascending: true });

    if (error) {
      return jsonError(500, 'Failed to fetch categories', 'LOAD_FAILED');
    }

    const categories = (data ?? []).sort(
      (a: { deleted_at: string | null }, b: { deleted_at: string | null }) => {
        const aDel = a.deleted_at ? 1 : 0;
        const bDel = b.deleted_at ? 1 : 0;
        return aDel - bDel;
      },
    );

    return NextResponse.json({ data: { categories }, error: null }, { status: 200, headers: SELLER_CACHE_REFERENCE });
  } catch {
    return jsonError(401, 'Unauthorized', 'UNAUTHORIZED');
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }

    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Only seller_admin can create categories', 'FORBIDDEN');
    }

    if (!claims.sub) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');
    }

    const parsed = CreateCategoryInputSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body';
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message: msg, details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { name, slug, description, display_order, external_ref, r2_image_original_key, r2_image_medium_key, r2_image_thumb_key } =
      parsed.data;

    const db = getRequestSupabaseClient() as any;

    // Check slug uniqueness within tenant
    const { data: existing } = await db
      .schema('app')
      .from('tenant_categories')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      return jsonError(409, 'A category with this slug already exists', 'CONFLICT');
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('tenant_categories')
      .insert({
        tenant_id: claims.tenant_id,
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() ?? null,
        display_order: display_order ?? 0,
        external_ref: external_ref?.trim() ? external_ref.trim() : null,
        r2_image_original_key: r2_image_original_key ?? null,
        r2_image_medium_key: r2_image_medium_key ?? null,
        r2_image_thumb_key: r2_image_thumb_key ?? null,
        is_active: true,
        review_status: 'draft',
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      console.error('[POST /api/tenant/categories]', insertError);
      return jsonError(500, 'Failed to create category', 'CREATE_FAILED');
    }

    const nowIso = new Date().toISOString();
    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'tenant_category',
      entity_id: inserted.id,
      action: 'create',
      diff: { name, slug, display_order },
      ts: nowIso,
    });

    return NextResponse.json({ data: { category: inserted }, error: null }, { status: 201 });
  } catch {
    return jsonError(401, 'Unauthorized', 'UNAUTHORIZED');
  }
}
