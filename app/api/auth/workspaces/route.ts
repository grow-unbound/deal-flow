import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { resolveCallerPhone } from '@/lib/server/resolve-auth-phone';
import { groupBuyerCandidatesByTenant } from '@/lib/server/workspaces';

/**
 * GET /api/auth/workspaces
 * Authenticated buyer — returns tenant-grouped workspace cards for catalog finder.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!claims.role || !(BUYER_ROLES as readonly string[]).includes(claims.role)) {
      return NextResponse.json({ error: 'Buyer session required' }, { status: 403 });
    }

    const phone = await resolveCallerPhone(claims.sub, claims.role);
    if (!phone) {
      return NextResponse.json({ error: 'No phone number on file for this account.' }, { status: 400 });
    }

    const candidates = await findBuyerLoginCandidates(phone);
    const tenants = groupBuyerCandidatesByTenant(candidates);

    return NextResponse.json({ tenants }, { headers: BUYER_CACHE_PERSONAL });
  } catch (err) {
    console.error('[GET /api/auth/workspaces]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
