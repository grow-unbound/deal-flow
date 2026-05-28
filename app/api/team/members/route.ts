import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import type { TeamMember } from '@/types/team';

export type { TeamMember };

export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_tenant_onboarding', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('tenant_users')
    .select('id, user_id, role, is_active, invited_at, joined_at')
    .eq('tenant_id', claims.tenant_id)
    .order('invited_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }

  // Fetch auth user details for all user_ids
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const authMap = new Map(
    (authUsers?.users ?? []).map((u) => [
      u.id,
      {
        email: u.email ?? '',
        full_name: (u.user_metadata?.full_name as string) ?? null,
        phone: (u.user_metadata?.phone as string) ?? u.phone ?? null,
      },
    ]),
  );

  const members: TeamMember[] = (rows ?? []).map(
    (row: {
      id: string;
      user_id: string;
      role: 'seller_admin' | 'seller_assistant';
      is_active: boolean;
      invited_at: string | null;
      joined_at: string | null;
    }) => {
      const auth = authMap.get(row.user_id);
      const status = row.is_active ? 'active' : (row.joined_at ? 'inactive' : 'pending');
      return {
        id: row.id,
        user_id: row.user_id,
        email: auth?.email ?? '',
        full_name: auth?.full_name ?? null,
        phone: auth?.phone ?? null,
        role: row.role,
        status,
        invited_at: row.invited_at,
        joined_at: row.joined_at,
      };
    },
  );

  return NextResponse.json({ members });
}
