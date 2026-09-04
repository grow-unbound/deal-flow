import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { findAllLoginCandidates } from '@/lib/server/buyer-access';
import { writeVerifiedCandidatesRecord } from '@/lib/server/buyer-otp-store';
import { resolveCallerPhone } from '@/lib/server/resolve-auth-phone';

/**
 * POST /api/auth/switch-context
 * Authenticated (session cookie or Bearer token) — no body.
 * Returns: { success: true; contexts: LoginOtpContext[]; ref_id: string }
 * or       { error: string } (400/401/500)
 *
 * Lets an already-logged-in seller/buyer jump straight to the multi-account
 * picker (/login/select-context) without a fresh OTP — resolves the caller's
 * own phone number authoritatively, looks up every account that phone is
 * linked to (same lookup the OTP flow uses), and hands back a `verified`
 * OTP-store ref_id the picker/select-context route already know how to use.
 */
export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const phone = await resolveCallerPhone(claims.sub, claims.role);
    if (!phone) {
      return NextResponse.json({ error: 'No phone number on file for this account.' }, { status: 400 });
    }

    const candidates = await findAllLoginCandidates(phone);
    if (candidates.length < 2) {
      return NextResponse.json({ error: 'No other accounts linked to this number.' }, { status: 400 });
    }

    const refId = await writeVerifiedCandidatesRecord(phone, candidates);
    if (!refId) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, contexts: candidates, ref_id: refId });
  } catch (err) {
    console.error('[switch-context] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
