import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { data: rows, error: rpcError } = await supabaseAdmin.rpc('get_user_workspace', {
    p_user_id: user.id,
  });

  if (rpcError || !rows || (rows as unknown[]).length === 0) {
    return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = (rows as any[])[0];
  if (!workspace?.tenant_id) {
    return NextResponse.json({ error: 'No tenant associated with this account' }, { status: 404 });
  }

  const tenantId = workspace.tenant_id as string;

  const [{ data: tRow }, { data: tsRow }] = await Promise.all([
    supabaseAdmin
      .schema('app')
      .from('tenants')
      .select('business_name, plan, gstin, primary_state, settings, created_at, updated_at')
      .eq('id', tenantId)
      .maybeSingle(),
    supabaseAdmin.schema('app').from('tenant_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  const planRaw = (tRow?.plan as string | undefined) ?? 'starter';
  const plan = planRaw === 'growth' || planRaw === 'scale' || planRaw === 'starter' ? planRaw : 'starter';

  const settingsFromTs = (tsRow as { settings?: Record<string, unknown> } | null)?.settings;
  const settingsFromLegacy = (tRow?.settings as Record<string, unknown> | undefined) ?? {};
  const settings = (tsRow != null ? (settingsFromTs ?? {}) : settingsFromLegacy) as Record<string, unknown>;

  const tenant = {
    id: tenantId,
    slug: (workspace.tenant_slug ?? tenantId) as string,
    business_name: ((workspace.tenant_name as string | undefined) ??
      (tRow?.business_name as string | undefined) ??
      'My Business') as string,
    subdomain: `${workspace.tenant_slug ?? tenantId}.yukti.so`,
    plan: plan as 'starter' | 'growth' | 'scale',
    gstin: (tRow?.gstin as string | null | undefined) ?? null,
    primary_state: (tRow?.primary_state as string | null | undefined) ?? null,
    settings,
    created_at: (tRow?.created_at as string | undefined) ?? new Date().toISOString(),
    updated_at: (tRow?.updated_at as string | undefined) ?? new Date().toISOString(),
  };

  return NextResponse.json({
    tenant,
    role: workspace.role as string,
    workspace_type: workspace.workspace_type as string,
  });
}
