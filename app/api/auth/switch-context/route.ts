import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES, SELLER_ROLES } from '@/constants';
import { findAllLoginCandidates, resolveSellerAuthPhone } from '@/lib/server/buyer-access';
import { writeVerifiedCandidatesRecord } from '@/lib/server/buyer-otp-store';
import { supabaseAdmin } from '@/lib/supabase';

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

async function resolveCallerPhone(userId: string, role: string | null): Promise<string | null> {
  if (!supabaseAdmin) return null;

  if (role && (SELLER_ROLES as readonly string[]).includes(role)) {
    // app.tenant_users.phone — matches what find_seller_candidates_by_phone matches on.
    // Falls back to auth.users only if tenant_users.phone was never backfilled, and
    // self-heals it when that happens (see resolveSellerAuthPhone).
    return resolveSellerAuthPhone(userId);
  }

  if (role && (BUYER_ROLES as readonly string[]).includes(role)) {
    // A user can be a member of multiple buyer accounts — take one deterministically
    // rather than .maybeSingle() (which errors on >1 rows).
    const { data } = await supabaseAdmin
      .schema('app')
      .from('buyer_users')
      .select('phone')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as { phone: string | null } | null)?.phone ?? null;
  }

  return null;
}
