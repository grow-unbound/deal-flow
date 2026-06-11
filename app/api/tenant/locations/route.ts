import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { normalizeLocationAddress } from '@/lib/locations/location-deactivate-guards';
import { CreateLocationInputSchema } from '@/types/tenant-locations';

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

    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    const db = supabaseAdmin as any;

    const includeDeleted =
      req.nextUrl.searchParams.get('include_deleted') === '1' && claims.role === 'seller_admin';

    let q = db
      .schema('app')
      .from('locations')
      .select(
        'id, tenant_id, name, address, is_default, type, inventory_tracking, external_ref, deleted_at, created_at, updated_at',
      )
      .eq('tenant_id', claims.tenant_id);
    if (!includeDeleted) {
      q = q.is('deleted_at', null);
    }
    const { data, error } = await q.order('is_default', { ascending: false }).order('created_at', { ascending: true });

    if (error) {
      return jsonError(500, 'Failed to fetch locations', 'LOAD_FAILED');
    }

    const locations = (data ?? [])
      .map((row: Record<string, unknown>) => ({
        ...row,
        address: normalizeLocationAddress(row.address),
      }))
      .sort(
        (
          a: { deleted_at: string | null; is_default: boolean; created_at: string },
          b: { deleted_at: string | null; is_default: boolean; created_at: string },
        ) => {
        const aDel = a.deleted_at ? 1 : 0;
        const bDel = b.deleted_at ? 1 : 0;
        if (aDel !== bDel) return aDel - bDel;
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return String(a.created_at).localeCompare(String(b.created_at));
      });

    return NextResponse.json({ data: { locations }, error: null }, { status: 200 });
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
      return jsonError(403, 'Only seller_admin can create locations', 'FORBIDDEN');
    }

    if (!claims.sub) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
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

    const parsed = CreateLocationInputSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body';
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message: msg, details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { name, address, is_default, type, inventory_tracking, external_ref } = parsed.data;

    const db = supabaseAdmin as any;

    if (is_default) {
      await db
        .schema('app')
        .from('locations')
        .update({ is_default: false, updated_at: new Date().toISOString(), updated_by: claims.sub })
        .eq('tenant_id', claims.tenant_id)
        .eq('is_default', true)
        .is('deleted_at', null);
    }

    const addr = address ?? { line1: '', line2: '', city: '', state: '', pincode: '' };

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('locations')
      .insert({
        tenant_id: claims.tenant_id,
        name,
        address: addr,
        is_default: is_default ?? false,
        type: type ?? 'warehouse',
        inventory_tracking: inventory_tracking ?? true,
        external_ref: external_ref?.trim() ? external_ref.trim() : null,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      console.error('[POST /api/tenant/locations]', insertError);
      return jsonError(500, 'Failed to create location', 'CREATE_FAILED');
    }

    const nowIso = new Date().toISOString();
    const { error: auditError } = await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'location',
      entity_id: inserted.id,
      action: 'create',
      diff: { name, type: type ?? 'warehouse', is_default: is_default ?? false },
      ts: nowIso,
    });
    if (auditError) {
      console.error('[POST /api/tenant/locations] audit', auditError);
    }

    const location = {
      ...inserted,
      address: normalizeLocationAddress(inserted.address),
    };

    return NextResponse.json({ data: { location }, error: null }, { status: 201 });
  } catch {
    return jsonError(401, 'Unauthorized', 'UNAUTHORIZED');
  }
}
