import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { UpdateCategoryInputSchema } from '@/types/tenant-categories';

export const dynamic = 'force-dynamic';

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid category id') });

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = IdParamsSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError(400, idParsed.error.issues[0]?.message ?? 'Invalid id', 'VALIDATION');
  }

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }
    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Only seller_admin can update categories', 'FORBIDDEN');
    }
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');
    }

    const parsed = UpdateCategoryInputSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid body';
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message: msg, details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    const db = supabaseAdmin as any;
    const nowIso = new Date().toISOString();

    const { data: row, error: loadErr } = await db
      .schema('app')
      .from('tenant_categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (loadErr || !row) {
      return jsonError(404, 'Category not found', 'NOT_FOUND');
    }

    if (patch.reactivate) {
      if (!row.deleted_at) {
        return jsonError(400, 'Category is already active', 'VALIDATION');
      }
      const { data: updated, error: upErr } = await db
        .schema('app')
        .from('tenant_categories')
        .update({ deleted_at: null, updated_at: nowIso, updated_by: claims.sub })
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id)
        .select()
        .single();

      if (upErr || !updated) {
        return jsonError(500, 'Failed to reactivate category', 'UPDATE_FAILED');
      }

      await db.schema('app').from('audit_log').insert({
        tenant_id: claims.tenant_id,
        actor_user_id: claims.sub,
        entity_type: 'tenant_category',
        entity_id: id,
        action: 'update',
        diff: { reactivated: true },
        ts: nowIso,
      });

      return NextResponse.json({ data: { category: updated }, error: null }, { status: 200 });
    }

    // Check slug uniqueness if changing slug
    if (patch.slug && patch.slug !== row.slug) {
      const { data: slugConflict } = await db
        .schema('app')
        .from('tenant_categories')
        .select('id')
        .eq('tenant_id', claims.tenant_id)
        .eq('slug', patch.slug)
        .is('deleted_at', null)
        .neq('id', id)
        .maybeSingle();

      if (slugConflict) {
        return jsonError(409, 'A category with this slug already exists', 'CONFLICT');
      }
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: nowIso,
      updated_by: claims.sub,
    };

    if (patch.name !== undefined) updatePayload.name = patch.name.trim();
    if (patch.slug !== undefined) updatePayload.slug = patch.slug.trim();
    if (patch.description !== undefined) updatePayload.description = patch.description?.trim() ?? null;
    if (patch.display_order !== undefined) updatePayload.display_order = patch.display_order;
    if (patch.is_active !== undefined) updatePayload.is_active = patch.is_active;
    if (patch.external_ref !== undefined) {
      updatePayload.external_ref =
        patch.external_ref === null || patch.external_ref.trim() === '' ? null : patch.external_ref.trim();
    }
    if (patch.r2_image_original_key !== undefined) updatePayload.r2_image_original_key = patch.r2_image_original_key;
    if (patch.r2_image_medium_key !== undefined) updatePayload.r2_image_medium_key = patch.r2_image_medium_key;
    if (patch.r2_image_thumb_key !== undefined) updatePayload.r2_image_thumb_key = patch.r2_image_thumb_key;

    const { data: updated, error: upErr } = await db
      .schema('app')
      .from('tenant_categories')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .select()
      .single();

    if (upErr || !updated) {
      console.error('[PATCH /api/tenant/categories/[id]]', upErr);
      return jsonError(500, 'Failed to update category', 'UPDATE_FAILED');
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'tenant_category',
      entity_id: id,
      action: 'update',
      diff: patch,
      ts: nowIso,
    });

    return NextResponse.json({ data: { category: updated }, error: null }, { status: 200 });
  } catch (e) {
    console.error('[PATCH /api/tenant/categories/[id]]', e);
    return jsonError(500, 'Internal server error', 'SERVER_ERROR');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = IdParamsSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError(400, idParsed.error.issues[0]?.message ?? 'Invalid id', 'VALIDATION');
  }

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }
    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Only seller_admin can deactivate categories', 'FORBIDDEN');
    }
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    const db = supabaseAdmin as any;
    const nowIso = new Date().toISOString();

    const { data: row, error: loadErr } = await db
      .schema('app')
      .from('tenant_categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (loadErr || !row) {
      return jsonError(404, 'Category not found', 'NOT_FOUND');
    }

    // Guard: cannot deactivate if products reference this category
    const { data: linked } = await db
      .schema('app')
      .from('tenant_products')
      .select('id')
      .eq('tenant_category_id', id)
      .is('deleted_at', null)
      .limit(1);

    if ((linked?.length ?? 0) > 0) {
      return jsonError(
        409,
        'Cannot deactivate this category while products are assigned to it. Reassign those products first.',
        'CONFLICT',
      );
    }

    const { error: delErr } = await db
      .schema('app')
      .from('tenant_categories')
      .update({
        deleted_at: nowIso,
        updated_at: nowIso,
        updated_by: claims.sub,
        is_active: false,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (delErr) {
      console.error('[DELETE /api/tenant/categories/[id]]', delErr);
      return jsonError(500, 'Failed to deactivate category', 'UPDATE_FAILED');
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'tenant_category',
      entity_id: id,
      action: 'delete',
      diff: { soft_deleted: true, name: row.name },
      ts: nowIso,
    });

    return NextResponse.json({ data: { id }, error: null }, { status: 200 });
  } catch (e) {
    console.error('[DELETE /api/tenant/categories/[id]]', e);
    return jsonError(500, 'Internal server error', 'SERVER_ERROR');
  }
}
