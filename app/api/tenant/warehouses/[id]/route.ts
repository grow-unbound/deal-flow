import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { loadWarehouseSummary } from '@/lib/server/warehouse-data';
import { hydrateWarehouse } from '@/lib/server/warehouse-data';
import { supabaseAdmin } from '@/lib/supabase';
import { UpdateWarehouseInputSchema } from '@/types/tenant-warehouses';

export const dynamic = 'force-dynamic';

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid warehouse id') });

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = IdParamsSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError(400, parsedId.error.issues[0]?.message ?? 'Invalid id', 'VALIDATION');
  }

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden', 'FORBIDDEN');
    if (!supabaseAdmin) return jsonError(500, 'Server configuration error', 'SERVER_ERROR');

    const db = supabaseAdmin as any;
    const detail = await loadWarehouseSummary(db, claims.tenant_id, id);
    if (!detail) return jsonError(404, 'Warehouse not found', 'NOT_FOUND');

    return NextResponse.json(detail, { status: 200 });
  } catch (error) {
    console.error('[GET /api/tenant/warehouses/[id]]', error);
    return jsonError(500, 'Failed to load warehouse detail', 'LOAD_FAILED');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = IdParamsSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError(400, parsedId.error.issues[0]?.message ?? 'Invalid id', 'VALIDATION');
  }

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Only seller_admin can update warehouses', 'FORBIDDEN');
    if (!supabaseAdmin) return jsonError(500, 'Server configuration error', 'SERVER_ERROR');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');
    }

    const parsed = UpdateWarehouseInputSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid body';
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message, details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    const db = supabaseAdmin as any;

    const { data: existing, error: existingError } = await db
      .schema('app')
      .from('warehouses')
      .select('id, tenant_id, address, is_default')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError || !existing) {
      return jsonError(404, 'Warehouse not found', 'NOT_FOUND');
    }

    const nowIso = new Date().toISOString();

    if (patch.is_default === true) {
      await db
        .schema('app')
        .from('warehouses')
        .update({ is_default: false, updated_at: nowIso, updated_by: claims.sub })
        .eq('tenant_id', claims.tenant_id)
        .eq('is_default', true)
        .is('deleted_at', null)
        .neq('id', id);
    }

    const currentAddress = (existing.address as Record<string, unknown> | null) ?? {};
    const nextAddress = patch.address
      ? {
          line1: typeof currentAddress.line1 === 'string' ? currentAddress.line1 : '',
          line2: typeof currentAddress.line2 === 'string' ? currentAddress.line2 : '',
          city: typeof currentAddress.city === 'string' ? currentAddress.city : '',
          state: typeof currentAddress.state === 'string' ? currentAddress.state : '',
          pincode: typeof currentAddress.pincode === 'string' ? currentAddress.pincode : '',
          ...patch.address,
        }
      : undefined;

    const updatePayload: Record<string, unknown> = {
      updated_at: nowIso,
      updated_by: claims.sub,
    };
    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.location_id !== undefined) updatePayload.location_id = patch.location_id;
    if (patch.address !== undefined) updatePayload.address = nextAddress;
    if (patch.phone_number !== undefined) updatePayload.phone_number = patch.phone_number?.trim() ? patch.phone_number.trim() : null;
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.is_default !== undefined) updatePayload.is_default = patch.is_default;
    if (patch.external_ref !== undefined) updatePayload.external_ref = patch.external_ref?.trim() ? patch.external_ref.trim() : null;
    if (patch.associated_users !== undefined) updatePayload.associated_users = patch.associated_users;
    if (patch.lat !== undefined) updatePayload.lat = patch.lat ?? null;
    if (patch.lng !== undefined) updatePayload.lng = patch.lng ?? null;

    const { data: updated, error: updateError } = await db
      .schema('app')
      .from('warehouses')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, lat, lng, deleted_at, created_at, updated_at, locations(id, name, is_default)')
      .single();

    if (updateError || !updated) {
      console.error('[PATCH /api/tenant/warehouses/[id]]', updateError);
      return jsonError(500, 'Failed to update warehouse', 'UPDATE_FAILED');
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'warehouse',
      entity_id: id,
      action: 'update',
      diff: patch,
      ts: nowIso,
    });

    return NextResponse.json(
      { data: { warehouse: hydrateWarehouse(updated as Record<string, unknown>) }, error: null },
      { status: 200 },
    );
  } catch (error) {
    console.error('[PATCH /api/tenant/warehouses/[id]]', error);
    return jsonError(500, 'Internal server error', 'SERVER_ERROR');
  }
}
