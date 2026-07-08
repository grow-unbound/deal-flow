import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import {
  normalizeLocationAddress,
} from '@/lib/locations/location-deactivate-guards';
import { normalizeLocationAssociatedUsers, syncLocationAssignees } from '@/lib/location-assignees';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';
import { UpdateLocationInputSchema } from '@/types/tenant-locations';

export const dynamic = 'force-dynamic';

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid location id') });

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
      return jsonError(403, 'Only seller_admin can update locations', 'FORBIDDEN');
    }
    const db = getRequestSupabaseClient() as any;

    const { data: row, error: loadErr } = await db
      .schema('app')
      .from('locations')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (loadErr || !row) {
      return jsonError(404, 'Location not found', 'NOT_FOUND');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');
    }

    const parsed = UpdateLocationInputSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid body';
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message: msg, details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    const nowIso = new Date().toISOString();

    if (patch.reactivate) {
      if (!row.deleted_at) {
        return jsonError(400, 'Location is already active', 'VALIDATION');
      }
      const { data: updated, error: upErr } = await db
        .schema('app')
        .from('locations')
        .update({
          deleted_at: null,
          status: 'active',
          updated_at: nowIso,
          updated_by: claims.sub,
        })
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id)
        .select()
        .single();
      if (upErr || !updated) {
        return jsonError(500, 'Failed to reactivate location', 'UPDATE_FAILED');
      }
      await db.schema('app').from('audit_log').insert({
        tenant_id: claims.tenant_id,
        actor_user_id: claims.sub,
        entity_type: 'location',
        entity_id: id,
        action: 'update',
        diff: { reactivated: true },
        ts: nowIso,
      });
      return NextResponse.json(
        { data: { location: { ...updated, address: normalizeLocationAddress(updated.address) } }, error: null },
        { status: 200 },
      );
    }

    if (patch.is_default === true) {
      await db
        .schema('app')
        .from('locations')
        .update({ is_default: false, updated_at: nowIso, updated_by: claims.sub })
        .eq('tenant_id', claims.tenant_id)
        .eq('is_default', true)
        .is('deleted_at', null)
        .neq('id', id);
    }

    const prevAddr = normalizeLocationAddress(row.address);
    const nextAddr =
      patch.address !== undefined
        ? { ...prevAddr, ...patch.address }
        : prevAddr;

    const updatePayload: Record<string, unknown> = {
      updated_at: nowIso,
      updated_by: claims.sub,
    };
    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.address !== undefined) updatePayload.address = nextAddr;
    if (patch.is_default !== undefined) updatePayload.is_default = patch.is_default;
    if (patch.external_ref !== undefined) {
      updatePayload.external_ref =
        patch.external_ref === null || patch.external_ref.trim() === '' ? null : patch.external_ref.trim();
    }
    if (patch.phone_number !== undefined) {
      updatePayload.phone_number = patch.phone_number === null || patch.phone_number.trim() === '' ? null : patch.phone_number.trim();
    }
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.associated_users !== undefined) updatePayload.associated_users = normalizeLocationAssociatedUsers(patch.associated_users);
    if (patch.lat !== undefined) updatePayload.lat = patch.lat ?? null;
    if (patch.lng !== undefined) updatePayload.lng = patch.lng ?? null;

    const { data: updated, error: upErr } = await db
      .schema('app')
      .from('locations')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .select()
      .single();

    if (upErr || !updated) {
      console.error('[PATCH /api/tenant/locations/[id]]', upErr);
      return jsonError(500, 'Failed to update location', 'UPDATE_FAILED');
    }

    if (patch.associated_users !== undefined) {
      const assignedUsers = await syncLocationAssignees(
        db,
        claims.tenant_id,
        id,
        normalizeLocationAssociatedUsers(patch.associated_users),
        claims.sub,
      );
      await db
        .schema('app')
        .from('locations')
        .update({ associated_users: assignedUsers })
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id);
      (updated as Record<string, unknown>).associated_users = assignedUsers;
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'location',
      entity_id: id,
      action: 'update',
      diff: patch,
      ts: nowIso,
    });

    return NextResponse.json(
      { data: { location: { ...updated, address: normalizeLocationAddress(updated.address) } }, error: null },
      { status: 200 },
    );
  } catch (e) {
    console.error('[PATCH /api/tenant/locations/[id]]', e);
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
      return jsonError(403, 'Only seller_admin can deactivate locations', 'FORBIDDEN');
    }
    const db = getRequestSupabaseClient() as any;
    const nowIso = new Date().toISOString();

    const { data: row, error: loadErr } = await db
      .schema('app')
      .from('locations')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (loadErr || !row) {
      return jsonError(404, 'Location not found', 'NOT_FOUND');
    }

    if (row.is_default) {
      const { data: candidates } = await db
        .schema('app')
        .from('locations')
        .select('id')
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null)
        .neq('id', id)
        .order('created_at', { ascending: true })
        .limit(1);
      const nextId = candidates?.[0]?.id as string | undefined;
      if (nextId) {
        await db
          .schema('app')
          .from('locations')
          .update({ is_default: true, updated_at: nowIso, updated_by: claims.sub })
          .eq('id', nextId)
          .eq('tenant_id', claims.tenant_id);
      }
    }

    const { error: delErr } = await db
      .schema('app')
      .from('locations')
      .update({
        deleted_at: nowIso,
        status: 'inactive',
        updated_at: nowIso,
        updated_by: claims.sub,
        is_default: false,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (delErr) {
      console.error('[DELETE /api/tenant/locations/[id]]', delErr);
      return jsonError(500, 'Failed to deactivate location', 'UPDATE_FAILED');
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'location',
      entity_id: id,
      action: 'delete',
      diff: { soft_deleted: true, name: row.name },
      ts: nowIso,
    });

    return NextResponse.json({ data: { id }, error: null }, { status: 200 });
  } catch (e) {
    console.error('[DELETE /api/tenant/locations/[id]]', e);
    return jsonError(500, 'Internal server error', 'SERVER_ERROR');
  }
}
