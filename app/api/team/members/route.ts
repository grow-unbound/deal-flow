import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getTenantMemberDirectory } from '@/lib/team-members';
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

  const [directory, locationsRes] = await Promise.all([
    getTenantMemberDirectory(claims.tenant_id),
    db
      .schema('app')
      .from('locations')
      .select('id, name, deleted_at')
      .eq('tenant_id', claims.tenant_id),
  ]);

  if (locationsRes.error) {
    return NextResponse.json({ error: 'Failed to fetch location assignments' }, { status: 500 });
  }

  const locationMap = new Map(
    ((locationsRes.data ?? []) as Array<{ id: string; name: string; deleted_at: string | null }>).map((location) => [
      location.id,
      location,
    ]),
  );

  const members: TeamMember[] = [...directory]
    .sort((a, b) => (b.invited_at ?? '').localeCompare(a.invited_at ?? ''))
    .map((row) => {
      const resolvedLocations = (row.location_ids ?? [])
        .map((id) => locationMap.get(id))
        .filter((location): location is { id: string; name: string; deleted_at: string | null } => Boolean(location));

      return {
        ...row,
        locations: resolvedLocations,
      };
    });

  return NextResponse.json({ members }, { headers: SELLER_CACHE_PERSONAL });
}
