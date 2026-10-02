import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { loadAccessAccounts } from '@/lib/server/buyer-access-accounts';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/buyer/access/accounts
 *
 * Every buyer account the caller's phone has at their session tenant, each with a status, for the
 * /pending screen: a phone can match several accounts (branches, shops), some enabled and some not,
 * and the buyer should see them all instead of being forced to request access for one.
 *
 * Only a `buyer_pending` session may call this — approved buyers use /api/buyer/siblings. Phone
 * trust rules live in loadAccessAccounts (OTP-verified phone only; never a mutable buyers.phone).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub || !claims.tenant_id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });
    }
    if (claims.role !== 'buyer_pending') {
      return NextResponse.json({ error: 'Pending buyer session required' }, { status: 403, headers: NO_STORE });
    }

    const { accounts } = await loadAccessAccounts(claims);
    return NextResponse.json({ accounts, current_buyer_id: claims.buyer_id }, { headers: NO_STORE });
  } catch (error) {
    console.error('[GET /api/buyer/access/accounts]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE });
  }
}
