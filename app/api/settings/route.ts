import { NextRequest, NextResponse } from 'next/server';
import { assertTenantClaim, AuthorizationError, getVerifiedClaims } from '@/lib/auth';
import { assembleTenantSettingsPayload } from '@/lib/tenant-settings/assemble-tenant-settings-payload';
import { supabaseAdmin } from '@/lib/supabase';
import { TenantSettingsPatchSchema } from '@/types/tenant-settings';

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Login required' } }, { status: 401 });
    }
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { data: null, error: { code: 'SERVER_ERROR', message: 'Server configuration error' } },
        { status: 500 },
      );
    }

    assertTenantClaim(claims);
    const db = supabaseAdmin;

    const [{ data: tsRow, error: tsErr }, { data: tenantRow, error: tErr }] = await Promise.all([
      db
        .schema('app')
        .from('tenant_settings')
        .select('settings')
        .eq('tenant_id', claims.tenant_id)
        .maybeSingle(),
      db
        .schema('app')
        .from('tenants')
        .select('business_name, gstin, primary_state, plan')
        .eq('id', claims.tenant_id)
        .maybeSingle(),
    ]);

    if (tsErr || tErr || !tenantRow) {
      console.error('[GET /api/settings]', tsErr, tErr);
      return NextResponse.json(
        { data: null, error: { code: 'LOAD_FAILED', message: 'Failed to load settings' } },
        { status: 500 },
      );
    }

    const raw = (tsRow as { settings?: unknown } | null)?.settings ?? {};
    const payload = await assembleTenantSettingsPayload(db, claims.tenant_id, raw, {
      business_name: tenantRow.business_name as string,
      gstin: (tenantRow.gstin as string | null) ?? null,
      primary_state: (tenantRow.primary_state as string | null) ?? null,
      plan: (tenantRow.plan as string) ?? 'starter',
    });

    return NextResponse.json({ data: payload, error: null }, { status: 200 });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Login required' } }, { status: 401 });
    }
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { data: null, error: { code: 'SERVER_ERROR', message: 'Server configuration error' } },
        { status: 500 },
      );
    }

    assertTenantClaim(claims);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ data: null, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 });
    }

    const parsed = TenantSettingsPatchSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Invalid body';
      return NextResponse.json({ data: null, error: { code: 'VALIDATION', message: msg } }, { status: 400 });
    }

    const db = supabaseAdmin;

    const { error: rpcError } = await db.schema('app').rpc('update_tenant_settings', {
      p_tenant_id: claims.tenant_id,
      p_actor_user_id: claims.sub,
      p_patch: parsed.data as Record<string, unknown>,
    });

    if (rpcError) {
      console.error('[PATCH /api/settings] rpc', rpcError);
      const forbidden = rpcError.message?.includes('forbidden');
      return NextResponse.json(
        { data: null, error: { code: forbidden ? 'FORBIDDEN' : 'SAVE_FAILED', message: rpcError.message } },
        { status: forbidden ? 403 : 500 },
      );
    }

    const b = parsed.data.business;
    if (b && Object.keys(b).length > 0) {
      const updates: Record<string, string | null> = {};
      if (b.company_name !== undefined) updates.business_name = b.company_name;
      if (b.gstin !== undefined) updates.gstin = b.gstin.trim() === '' ? null : b.gstin.trim();
      if (b.address?.state !== undefined) updates.primary_state = b.address.state.trim() === '' ? null : b.address.state.trim();
      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await db
          .schema('app')
          .from('tenants')
          .update({ ...updates, updated_by: claims.sub })
          .eq('id', claims.tenant_id);
        if (upErr) {
          console.error('[PATCH /api/settings] tenant sync', upErr);
        }
      }
    }

    const [{ data: tsRow }, { data: tenantRow }] = await Promise.all([
      db
        .schema('app')
        .from('tenant_settings')
        .select('settings')
        .eq('tenant_id', claims.tenant_id)
        .maybeSingle(),
      db
        .schema('app')
        .from('tenants')
        .select('business_name, gstin, primary_state, plan')
        .eq('id', claims.tenant_id)
        .maybeSingle(),
    ]);

    if (!tenantRow) {
      return NextResponse.json({ data: null, error: { code: 'LOAD_FAILED', message: 'Tenant not found' } }, { status: 404 });
    }

    const raw = (tsRow as { settings?: unknown } | null)?.settings ?? {};
    const payload = await assembleTenantSettingsPayload(db, claims.tenant_id, raw, {
      business_name: tenantRow.business_name as string,
      gstin: (tenantRow.gstin as string | null) ?? null,
      primary_state: (tenantRow.primary_state as string | null) ?? null,
      plan: (tenantRow.plan as string) ?? 'starter',
    });

    return NextResponse.json({ data: payload, error: null }, { status: 200 });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }
}
