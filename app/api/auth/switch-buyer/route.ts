import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import {
  findBuyerLoginCandidates,
  mintBuyerSession,
} from '@/lib/server/buyer-access';
import { resolveCallerPhone } from '@/lib/server/resolve-auth-phone';

const SwitchBuyerSchema = z.object({
  buyer_id: z.string().uuid(),
});

/**
 * POST /api/auth/switch-buyer
 * Remint buyer JWT for another buyer_id in the same tenant (Buy As).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub || !claims.tenant_id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!claims.role || !(BUYER_ROLES as readonly string[]).includes(claims.role)) {
      return NextResponse.json({ error: 'Buyer session required' }, { status: 403 });
    }

    const parsed = SwitchBuyerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'buyer_id is required' }, { status: 400 });
    }

    const phone = await resolveCallerPhone(claims.sub, claims.role);
    if (!phone) {
      return NextResponse.json({ error: 'No phone number on file for this account.' }, { status: 400 });
    }

    const candidates = await findBuyerLoginCandidates(phone);
    const match = candidates.find(
      (candidate) =>
        candidate.tenant_id === claims.tenant_id
        && candidate.buyer_id === parsed.data.buyer_id,
    );

    if (!match) {
      return NextResponse.json({ error: 'Selected buyer is not available in this tenant.' }, { status: 403 });
    }

    const { session } = await mintBuyerSession(match);

    return NextResponse.json({ session });
  } catch (err) {
    console.error('[POST /api/auth/switch-buyer]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
