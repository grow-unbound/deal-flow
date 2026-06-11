import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import {
  hasBlockingStockAtLocation,
  normalizeLocationAddress,
  wouldRemoveLastTrackedLocation,
} from '@/lib/locations/location-deactivate-guards';
import { supabaseAdmin } from '@/lib/supabase';
import { UpdateLocationInputSchema } from '@/types/tenant-locations';

export const dynamic = 'force-dynamic';

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid location id') });

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

async function tenantHasAnyInventoryRow(db: any, tenantId: string): Promise<boolean> {
  const { data: locs, error: locErr } = await db
    .schema('app')
    .from('locations')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(500);
  if (locErr) {
    console.error('[locations/[id]] tenantHasAnyInventoryRow/locs', locErr);
    return true;
  }
  const ids = (locs ?? []).map((l: { id: string }) => l.id);
  if (ids.length === 0) return false;
  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('id')
    .in('location_id', ids)
    .limit(1);
  if (error) {
    console.error('[locations/[id]] tenantHasAnyInventoryRow', error);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

async function loadActiveLocations(db: any, tenantId: string) {
  const { data, error } = await db
    .schema('app')
    .from('locations')
    .select('id, inventory_tracking, deleted_at, is_default, created_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function stockAtLocation(db: any, locationId: string) {
  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('qty_available, qty_reserved')
    .eq('location_id', locationId)
    .or('qty_available.gt.0,qty_reserved.gt.0')
    .limit(1);
  if (error) {
    console.error('[locations/[id]] stockAtLocation', error);
    return null;
  }
  return data?.[0] as { qty_available: number; qty_reserved: number } | undefined;
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
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
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
    const db = supabaseAdmin as any;

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

    if (patch.inventory_tracking === false && row.inventory_tracking === true) {
      const active = await loadActiveLocations(db, claims.tenant_id);
      const hasRows = await tenantHasAnyInventoryRow(db, claims.tenant_id);
      const simulated = active.map((l: { id: string; inventory_tracking: boolean; deleted_at: null }) => ({
        id: l.id,
        inventory_tracking: l.id === id ? false : l.inventory_tracking,
        deleted_at: null,
      }));
      if (
        wouldRemoveLastTrackedLocation({
          targetLocationId: id,
          targetInventoryTracking: true,
          allActiveLocations: simulated,
          tenantHasInventoryRows: hasRows,
        })
      ) {
        return jsonError(
          409,
          'Cannot turn off inventory tracking on the last tracked location while inventory rows exist. Add another tracked location first.',
          'CONFLICT',
        );
      }
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
    if (patch.type !== undefined) updatePayload.type = patch.type;
    if (patch.address !== undefined) updatePayload.address = nextAddr;
    if (patch.inventory_tracking !== undefined) updatePayload.inventory_tracking = patch.inventory_tracking;
    if (patch.is_default !== undefined) updatePayload.is_default = patch.is_default;
    if (patch.external_ref !== undefined) {
      updatePayload.external_ref =
        patch.external_ref === null || patch.external_ref.trim() === '' ? null : patch.external_ref.trim();
    }

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
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    const db = supabaseAdmin as any;
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

    const invRow = await stockAtLocation(db, id);
    if (hasBlockingStockAtLocation(invRow)) {
      return jsonError(
        409,
        'Cannot deactivate this location while it still has available or reserved stock. Move or zero stock first.',
        'CONFLICT',
      );
    }

    const active = await loadActiveLocations(db, claims.tenant_id);
    const hasRows = await tenantHasAnyInventoryRow(db, claims.tenant_id);
    if (
      wouldRemoveLastTrackedLocation({
        targetLocationId: id,
        targetInventoryTracking: row.inventory_tracking,
        allActiveLocations: active.map((l: { id: string; inventory_tracking: boolean; deleted_at: null }) => ({
          id: l.id,
          inventory_tracking: l.inventory_tracking,
          deleted_at: null,
        })),
        tenantHasInventoryRows: hasRows,
      })
    ) {
      return jsonError(
        409,
        'Cannot deactivate the last inventory-tracked location while inventory rows exist. Add another tracked location first.',
        'CONFLICT',
      );
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
