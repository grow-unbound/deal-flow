import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { normalizeLocationAddress } from '@/lib/locations/location-deactivate-guards';
import { supabaseAdmin } from '@/lib/supabase';
import {
  CreateWarehouseInputSchema,
  type TenantWarehouse,
} from '@/types/tenant-warehouses';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

function hydrateWarehouse(row: Record<string, unknown>): TenantWarehouse {
  const location = row.locations;
  const locationRecord = location && typeof location === 'object'
    ? {
        id: typeof (location as Record<string, unknown>).id === 'string' ? String((location as Record<string, unknown>).id) : '',
        name: typeof (location as Record<string, unknown>).name === 'string' ? String((location as Record<string, unknown>).name) : '',
        is_default: (location as Record<string, unknown>).is_default === true,
      }
    : null;

  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    location_id: typeof row.location_id === 'string' ? row.location_id : null,
    name: String(row.name ?? ''),
    address: normalizeLocationAddress(row.address),
    phone_number: typeof row.phone_number === 'string' ? row.phone_number : null,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    is_default: row.is_default === true,
    external_ref: typeof row.external_ref === 'string' ? row.external_ref : null,
    associated_users: Array.isArray(row.associated_users) ? row.associated_users as TenantWarehouse['associated_users'] : [],
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    location: locationRecord?.id ? locationRecord : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }

    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Forbidden', 'FORBIDDEN');
    }

    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    const db = supabaseAdmin as any;
    const includeDeleted =
      req.nextUrl.searchParams.get('include_deleted') === '1' && claims.role === 'seller_admin';

    let query = db
      .schema('app')
      .from('warehouses')
      .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, lat, lng, deleted_at, created_at, updated_at, locations(id, name, is_default)')
      .eq('tenant_id', claims.tenant_id);

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      return jsonError(500, 'Failed to fetch warehouses', 'LOAD_FAILED');
    }

    const warehouses = ((data ?? []) as Record<string, unknown>[]).map(hydrateWarehouse);
    return NextResponse.json({ data: { warehouses }, error: null }, { status: 200 });
  } catch {
    return jsonError(401, 'Unauthorized', 'UNAUTHORIZED');
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id || !claims.sub) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }

    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Only seller_admin can create warehouses', 'FORBIDDEN');
    }

    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');
    }

    const parsed = CreateWarehouseInputSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body';
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message: msg, details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = supabaseAdmin as any;

    if (parsed.data.is_default) {
      await db
        .schema('app')
        .from('warehouses')
        .update({ is_default: false, updated_at: new Date().toISOString(), updated_by: claims.sub })
        .eq('tenant_id', claims.tenant_id)
        .eq('is_default', true)
        .is('deleted_at', null);
    }

    const address = parsed.data.address ?? { line1: '', line2: '', city: '', state: '', pincode: '' };

    const { data: inserted, error } = await db
      .schema('app')
      .from('warehouses')
      .insert({
        tenant_id: claims.tenant_id,
        location_id: parsed.data.location_id ?? null,
        name: parsed.data.name,
        address,
        phone_number: parsed.data.phone_number ?? null,
        status: parsed.data.status,
        is_default: parsed.data.is_default,
        external_ref: parsed.data.external_ref ?? null,
        associated_users: parsed.data.associated_users,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, lat, lng, deleted_at, created_at, updated_at, locations(id, name, is_default)')
      .single();

    if (error || !inserted) {
      console.error('[POST /api/tenant/warehouses]', error);
      return jsonError(500, 'Failed to create warehouse', 'CREATE_FAILED');
    }

    return NextResponse.json(
      { data: { warehouse: hydrateWarehouse(inserted as Record<string, unknown>) }, error: null },
      { status: 201 },
    );
  } catch {
    return jsonError(500, 'Internal server error', 'SERVER_ERROR');
  }
}
