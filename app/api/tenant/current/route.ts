import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { canonicalStorefrontHost, storefrontOriginForRequest } from '@/lib/storefront-host';

export async function GET(request: NextRequest) {
  // Fast path reads middleware-verified JWT claims (no Auth network call); only falls
  // back to a live auth.getUser() + RPC round-trip when the claims are incomplete
  // (e.g. hook not configured yet) — same pattern already used elsewhere (team/members).
  const claims = await getVerifiedClaims(request);
  if (!claims.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let tenantId = claims.tenant_id;
  let workspaceRole = claims.role;
  let workspaceType: string | null = tenantId ? (claims.buyer_id ? 'buyer' : 'seller') : null;
  let workspaceTenantName: string | null = null;
  let workspaceTenantSlug: string | null = null;

  if (!tenantId) {
    const { data: rows, error: rpcError } = await supabaseAdmin.rpc('get_user_workspace', {
      p_user_id: claims.sub,
    });

    if (rpcError || !rows || (rows as unknown[]).length === 0) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workspace = (rows as any[])[0];
    if (!workspace?.tenant_id) {
      return NextResponse.json({ error: 'No tenant associated with this account' }, { status: 404 });
    }

    tenantId = workspace.tenant_id as string;
    workspaceRole = workspace.role as string;
    workspaceType = workspace.workspace_type as string;
    workspaceTenantName = workspace.tenant_name as string | null;
    workspaceTenantSlug = workspace.tenant_slug as string | null;
  }

  const [{ data: tRow }, { data: tsRow }, { data: catalogRow }] = await Promise.all([
    supabaseAdmin
      .schema('app')
      .from('tenants')
      .select('business_name, plan, gstin, primary_state, settings, created_at, updated_at, slug')
      .eq('id', tenantId)
      .maybeSingle(),
    supabaseAdmin.schema('app').from('tenant_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    supabaseAdmin
      .schema('app')
      .from('catalogs')
      .select('live_at')
      .eq('tenant_id', tenantId)
      .eq('kind', 'public')
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  const planRaw = (tRow?.plan as string | undefined) ?? 'starter';
  const plan =
    planRaw === 'lite' || planRaw === 'growth' || planRaw === 'scale' || planRaw === 'starter' ? planRaw : 'starter';

  const settingsFromTs = (tsRow as { settings?: Record<string, unknown> } | null)?.settings;
  const settingsFromLegacy = (tRow?.settings as Record<string, unknown> | undefined) ?? {};
  const settings = (tsRow != null ? (settingsFromTs ?? {}) : settingsFromLegacy) as Record<string, unknown>;

  const tenant = {
    id: tenantId,
    slug: (workspaceTenantSlug ?? (tRow?.slug as string | undefined) ?? tenantId) as string,
    business_name: (workspaceTenantName ??
      (tRow?.business_name as string | undefined) ??
      'My Business') as string,
    subdomain: canonicalStorefrontHost(
      (workspaceTenantSlug ?? (tRow?.slug as string | undefined) ?? tenantId) as string,
    ),
    plan: plan as 'lite' | 'starter' | 'growth' | 'scale',
    gstin: (tRow?.gstin as string | null | undefined) ?? null,
    primary_state: (tRow?.primary_state as string | null | undefined) ?? null,
    settings,
    created_at: (tRow?.created_at as string | undefined) ?? new Date().toISOString(),
    updated_at: (tRow?.updated_at as string | undefined) ?? new Date().toISOString(),
  };

  return NextResponse.json({
    tenant,
    role: workspaceRole,
    workspace_type: workspaceType,
    public_catalog_live: Boolean((catalogRow as { live_at?: string | null } | null)?.live_at),
    storefront_url: storefrontOriginForRequest(request.headers.get('host') ?? '', tenant.slug),
  }, { headers: SELLER_CACHE_PERSONAL });
}
