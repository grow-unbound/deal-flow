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

  // Build tenant from RPC data — avoids direct app-schema PostgREST access
  // (app schema is not in Supabase's exposed schemas list)
  const tenant = {
    id: workspace.tenant_id as string,
    slug: (workspace.tenant_slug ?? workspace.tenant_id) as string,
    business_name: (workspace.tenant_name ?? 'My Business') as string,
    subdomain: `${workspace.tenant_slug ?? workspace.tenant_id}.dealflow.in`,
    plan: 'starter' as const,
    gstin: null as string | null,
    primary_state: null as string | null,
    settings: {} as Record<string, unknown>,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return NextResponse.json({
    tenant,
    role: workspace.role as string,
    workspace_type: workspace.workspace_type as string,
  });
}
