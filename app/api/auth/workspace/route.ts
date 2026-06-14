import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getPostHogClient } from '@/lib/posthog-server';

interface WorkspaceRow {
  workspace_type: 'seller' | 'buyer';
  role: string;
  tenant_id: string | null;
  tenant_slug: string | null;
  tenant_name: string | null;
  buyer_id: string | null;
  location_ids?: string[] | null;
}

/**
 * POST /api/auth/workspace
 * Called client-side after Supabase auth succeeds.
 * Body: { user_id, email, access_token }
 * Returns: workspace type, role, and redirect path.
 */
export async function POST(request: NextRequest) {
  try {
    const { user_id, email, access_token } = await request.json() as {
      user_id?: string;
      email?: string;
      access_token?: string;
    };

    if (!user_id || !access_token) {
      return NextResponse.json({ error: 'Missing user_id or access_token' }, { status: 400 });
    }

    // Verify the token is legit before we trust the user_id
    const { data: { user }, error: userError } = await supabase.auth.getUser(access_token);
    if (userError || !user || user.id !== user_id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const db = supabaseAdmin ?? supabase;
    const { data: rows, error: wsError } = await db.rpc('get_user_workspace', { p_user_id: user_id });

    if (wsError) {
      console.error('Workspace RPC error:', wsError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const workspace = (rows as WorkspaceRow[] | null)?.[0] ?? null;

    if (!workspace) {
      return NextResponse.json(
        { error: 'Account not associated with any workspace. Contact your administrator.' },
        { status: 403 }
      );
    }

    // PostHog — non-blocking
    try {
      const ph = getPostHogClient();
      const distinctId = request.headers.get('X-POSTHOG-DISTINCT-ID') ?? user_id;
      ph.identify({
        distinctId: user_id,
        properties: { email, role: workspace.role, workspace_type: workspace.workspace_type },
      });
      ph.capture({
        distinctId,
        event: 'user_signed_in',
        properties: {
          user_type: workspace.workspace_type,
          role: workspace.role,
          ...(workspace.tenant_slug ? { tenant_slug: workspace.tenant_slug } : {}),
          $session_id: request.headers.get('X-POSTHOG-SESSION-ID') ?? undefined,
        },
      });
      await ph.flush();
    } catch (phErr) {
      console.warn('PostHog tracking failed (non-blocking):', phErr);
    }

    return NextResponse.json({
      success: true,
      role: workspace.role,
      workspace_type: workspace.workspace_type,
      redirect: workspace.workspace_type === 'seller' ? '/dashboard' : '/shop',
      tenant: workspace.tenant_id
        ? { id: workspace.tenant_id, slug: workspace.tenant_slug, name: workspace.tenant_name }
        : null,
    });
  } catch (err) {
    console.error('Workspace lookup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
