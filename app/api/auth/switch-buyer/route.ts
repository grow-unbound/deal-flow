import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import {
  findBuyerLoginCandidates,
  mintBuyerSession,
} from '@/lib/server/buyer-access';
import { resolveSwitchLookupPhone, restrictCandidatesToAuthenticatedUser } from '@/lib/server/auth-switch-phone';
import { supabaseAdmin } from '@/lib/supabase';

const SwitchBuyerSchema = z.object({
  buyer_id: z.string().uuid(),
});

/**
 * POST /api/auth/switch-buyer
 * Remint buyer JWT for another buyer_id in the same tenant (Buy As).
 *
 * SECURITY: prefer the caller's OTP-verified phone
 * (`app_metadata.otp_verified_phone`, stamped only by a real OTP hash check).
 * Legacy authenticated sessions may fall back to the auth identity's phone,
 * but those results are restricted to candidates already linked to the same
 * auth user id. Never use `app.buyers.phone`/`app.buyer_users.phone`
 * (resolveCallerPhone) for broad candidate lookup: those are mutable business
 * columns with no OTP re-verification on write.
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

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(claims.sub);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const lookup = resolveSwitchLookupPhone(userData.user);
    if (!lookup) {
      return NextResponse.json(
        { error: 'Please log in again to switch accounts.' },
        { status: 400 },
      );
    }

    const candidates = restrictCandidatesToAuthenticatedUser(
      await findBuyerLoginCandidates(lookup.phone),
      claims,
      lookup,
    );
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
